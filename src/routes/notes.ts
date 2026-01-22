import { Router, Response } from 'express';
import { UploadedFile } from 'express-fileupload';
import mongoose from 'mongoose';
import { Note } from '../models/Note';
import { User } from '../models/User';
import { uploadFile, uploadBase64, deleteFile } from '../config/upload';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all notes for authenticated user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { archived, deleted } = req.query;
    
    let filter: any = { userId: req.userId };
    
    if (deleted === 'true') {
      filter.isDeleted = true;
    } else if (archived === 'true') {
      filter.isDeleted = { $ne: true };
      filter.isArchived = true;
    } else {
      filter.isDeleted = { $ne: true };
      filter.isArchived = { $ne: true };
    }
    
    const notes = await Note.find(filter).sort({ isPinned: -1, date: -1 });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// Get single note
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.userId });
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// Create note
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, color, images, isPinned } = req.body;

    const uploadedImages = [];
    if (images && images.length > 0) {
      for (const img of images) {
        if (img.url.startsWith('data:')) {
          const uploaded = await uploadBase64(img.url);
          uploadedImages.push({
            id: img.id || Date.now().toString(),
            url: uploaded.url,
            publicId: uploaded.publicId,
          });
        } else {
          uploadedImages.push(img);
        }
      }
    }

    const note = new Note({
      title: title || 'Untitled',
      content,
      color,
      images: uploadedImages,
      userId: req.userId,
      date: new Date(),
      isPinned: isPinned || false,
      isArchived: false,
      isDeleted: false,
    });

    await note.save();
    res.status(201).json(note);
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Update note
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, color, images, isPinned, isArchived } = req.body;
    const existingNote = await Note.findOne({ _id: req.params.id, userId: req.userId });

    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const uploadedImages = [];
    if (images && images.length > 0) {
      for (const img of images) {
        if (img.url.startsWith('data:')) {
          const uploaded = await uploadBase64(img.url);
          uploadedImages.push({
            id: img.id || Date.now().toString(),
            url: uploaded.url,
            publicId: uploaded.publicId,
          });
        } else {
          uploadedImages.push(img);
        }
      }
    }

    // Delete removed images from Cloudinary
    const newImageIds = images?.map((img: { id: string }) => img.id) || [];
    const removedImages = existingNote.images.filter(
      (img) => !newImageIds.includes(img.id)
    );

    for (const img of removedImages) {
      if (img.publicId) {
        await deleteFile(img.publicId);
      }
    }

    const updateData: any = {
      title: title || 'Untitled',
      content,
      color,
      images: uploadedImages,
      date: new Date(),
    };

    if (typeof isPinned === 'boolean') updateData.isPinned = isPinned;
    if (typeof isArchived === 'boolean') updateData.isArchived = isArchived;

    const updatedNote = await Note.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedNote);
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Soft delete note (move to trash)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { permanent } = req.query;
    const note = await Note.findOne({ _id: req.params.id, userId: req.userId });
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (permanent === 'true') {
      // Permanent delete - remove images from Cloudinary
      for (const img of note.images) {
        if (img.publicId) {
          await deleteFile(img.publicId);
        }
      }
      await Note.findByIdAndDelete(req.params.id);
      res.json({ message: 'Note permanently deleted' });
    } else {
      // Soft delete - move to trash
      await Note.findByIdAndUpdate(req.params.id, {
        isDeleted: true,
        deletedAt: new Date(),
      });
      res.json({ message: 'Note moved to trash' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Restore note from trash
router.post('/:id/restore', async (req: AuthRequest, res: Response) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.userId, isDeleted: true });
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found in trash' });
    }

    await Note.findByIdAndUpdate(req.params.id, {
      isDeleted: false,
      deletedAt: null,
    });

    res.json({ message: 'Note restored successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore note' });
  }
});

// Empty trash (permanently delete all trashed notes)
router.delete('/trash/empty', async (req: AuthRequest, res: Response) => {
  try {
    const trashedNotes = await Note.find({ userId: req.userId, isDeleted: true });
    
    for (const note of trashedNotes) {
      for (const img of note.images) {
        if (img.publicId) {
          await deleteFile(img.publicId);
        }
      }
    }

    await Note.deleteMany({ userId: req.userId, isDeleted: true });
    res.json({ message: 'Trash emptied successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

// Upload image via base64
router.post('/upload', async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const uploaded = await uploadBase64(image);
    res.json({
      id: Date.now().toString(),
      url: uploaded.url,
      publicId: uploaded.publicId,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload image via file (express-fileupload)
router.post('/upload-file', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.files.file as UploadedFile;
    const uploaded = await uploadFile(file);
    
    res.json({
      id: Date.now().toString(),
      url: uploaded.url,
      publicId: uploaded.publicId,
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Toggle like on a note
router.post('/:id/like', async (req: AuthRequest, res: Response) => {
  try {
    const noteId = req.params.id;
    const userId = req.userId;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (!note.isPublic && note.userId !== userId) {
      return res.status(403).json({ error: 'Cannot like private note' });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const alreadyLiked = note.likes.some((id) => id.toString() === userId);

    if (alreadyLiked) {
      note.likes = note.likes.filter((id) => id.toString() !== userId);
    } else {
      note.likes.push(userObjectId);
    }

    await note.save();

    res.json({
      liked: !alreadyLiked,
      likesCount: note.likes.length,
    });
  } catch (error) {
    console.error('Like note error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Duplicate a note (copy from friend's note to own)
router.post('/:id/duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const noteId = req.params.id;
    const userId = req.userId;

    const originalNote = await Note.findById(noteId);
    if (!originalNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (!originalNote.isPublic && originalNote.userId !== userId) {
      const noteOwner = await User.findById(originalNote.userId);
      const currentUser = await User.findById(userId);
      
      if (!noteOwner || !currentUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isFriend = currentUser.friends.some(
        (f) => f.toString() === originalNote.userId
      );

      if (!isFriend) {
        return res.status(403).json({ error: 'Cannot duplicate private note' });
      }
    }

    const duplicatedNote = new Note({
      title: `${originalNote.title} (Copy)`,
      content: originalNote.content,
      color: originalNote.color,
      images: originalNote.images,
      userId: userId,
      date: new Date(),
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      isPublic: true,
      likes: [],
    });

    await duplicatedNote.save();

    res.status(201).json(duplicatedNote);
  } catch (error) {
    console.error('Duplicate note error:', error);
    res.status(500).json({ error: 'Failed to duplicate note' });
  }
});

// Toggle note visibility (public/private)
router.put('/:id/visibility', async (req: AuthRequest, res: Response) => {
  try {
    const noteId = req.params.id;
    const { isPublic } = req.body;

    const note = await Note.findOne({ _id: noteId, userId: req.userId });
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    note.isPublic = isPublic;
    await note.save();

    res.json({
      message: 'Note visibility updated',
      isPublic: note.isPublic,
    });
  } catch (error) {
    console.error('Update visibility error:', error);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// Get friend's public notes
router.get('/user/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.userId;

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId),
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isFriend = currentUser.friends.some((f) => f.toString() === targetUserId);
    const isOwn = currentUserId === targetUserId;

    if (!isOwn && !isFriend) {
      return res.status(403).json({ error: 'Not authorized to view notes' });
    }

    if (!isOwn && targetUser.isPrivate) {
      return res.status(403).json({ error: 'User profile is private' });
    }

    const filter: any = {
      userId: targetUserId,
      isDeleted: { $ne: true },
      isArchived: { $ne: true },
    };

    if (!isOwn) {
      filter.isPublic = true;
    }

    const notes = await Note.find(filter).sort({ isPinned: -1, date: -1 });

    const notesWithLikeInfo = notes.map((note) => ({
      _id: note._id,
      title: note.title,
      content: note.content,
      color: note.color,
      images: note.images,
      date: note.date,
      userId: note.userId,
      isPinned: note.isPinned,
      isPublic: note.isPublic,
      likesCount: note.likes?.length || 0,
      isLiked: note.likes?.some((id) => id.toString() === currentUserId) || false,
      isOwn,
    }));

    res.json(notesWithLikeInfo);
  } catch (error) {
    console.error('Get user notes error:', error);
    res.status(500).json({ error: 'Failed to get user notes' });
  }
});

export default router;
