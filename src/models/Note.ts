import mongoose, { Document, Schema } from 'mongoose';

export interface IImage {
  id: string;
  url: string;
  publicId: string;
}

export interface INote extends Document {
  title: string;
  content: string;
  color: string;
  images: IImage[];
  date: Date;
  userId?: string;
  isPinned: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  isPublic: boolean;
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ImageSchema = new Schema<IImage>({
  id: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
});

const NoteSchema = new Schema<INote>(
  {
    title: { type: String, required: true, default: 'Tanpa Judul' },
    content: { type: String, default: '' },
    color: { type: String, default: '#E9D5FF' },
    images: { type: [ImageSchema], default: [] },
    date: { type: Date, default: Date.now },
    userId: { type: String, index: true },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    isPublic: { type: Boolean, default: true },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  {
    timestamps: true,
  }
);

export const Note = mongoose.model<INote>('Note', NoteSchema);
