import { Router, Request, Response } from 'express';
import { User, IUser } from '../models/User';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  authMiddleware,
  AuthRequest 
} from '../middleware/auth';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';

const router = Router();
const googleClient = new OAuth2Client(config.google?.clientId);

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = new User({
      email: email.toLowerCase(),
      password,
      name,
    });

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());
    
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Refresh Token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token', code: 'REFRESH_EXPIRED' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString());

    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId);
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      isPrivate: user.isPrivate,
      authProvider: user.authProvider,
      friendsCount: user.friends?.length || 0,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Google OAuth
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.google?.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }

    const { email, name, picture, sub: googleId } = payload;

    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
      }
    } else {
      user = new User({
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        googleId,
        authProvider: 'google',
        avatar: picture || '',
        isPrivate: false,
        friends: [],
        friendRequests: [],
        sentFriendRequests: [],
      });
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());
    
    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      message: 'Google login successful',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Failed to authenticate with Google' });
  }
});

// Update Profile
router.put('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, avatar, isPrivate } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name !== undefined) user.name = name.trim();
    if (bio !== undefined) user.bio = bio.substring(0, 200);
    if (avatar !== undefined) user.avatar = avatar;
    if (isPrivate !== undefined) user.isPrivate = isPrivate;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        bio: user.bio,
        isPrivate: user.isPrivate,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Search users (for adding friends)
router.get('/users/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await User.find({
      $and: [
        { _id: { $ne: req.userId } },
        {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
          ],
        },
      ],
    })
      .select('_id name email avatar')
      .limit(20);

    const currentUser = await User.findById(req.userId);
    
    const usersWithStatus = users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      isFriend: currentUser?.friends.some((f) => f.toString() === u._id.toString()) || false,
      isPending: currentUser?.sentFriendRequests.some((f) => f.toString() === u._id.toString()) || false,
      hasRequest: currentUser?.friendRequests.some((f) => f.toString() === u._id.toString()) || false,
    }));

    res.json(usersWithStatus);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Send friend request
router.post('/friends/request/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    
    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(targetUserId),
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (currentUser.friends.some((f) => f.toString() === targetUserId)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    if (currentUser.sentFriendRequests.some((f) => f.toString() === targetUserId)) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    currentUser.sentFriendRequests.push(targetUser._id);
    targetUser.friendRequests.push(currentUser._id);

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/friends/accept/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const requesterUserId = req.params.userId;

    const [currentUser, requesterUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(requesterUserId),
    ]);

    if (!currentUser || !requesterUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!currentUser.friendRequests.some((f) => f.toString() === requesterUserId)) {
      return res.status(400).json({ error: 'No friend request from this user' });
    }

    currentUser.friendRequests = currentUser.friendRequests.filter(
      (f) => f.toString() !== requesterUserId
    );
    requesterUser.sentFriendRequests = requesterUser.sentFriendRequests.filter(
      (f) => f.toString() !== req.userId
    );

    currentUser.friends.push(requesterUser._id);
    requesterUser.friends.push(currentUser._id);

    await Promise.all([currentUser.save(), requesterUser.save()]);

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline friend request
router.post('/friends/decline/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const requesterUserId = req.params.userId;

    const [currentUser, requesterUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(requesterUserId),
    ]);

    if (!currentUser || !requesterUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    currentUser.friendRequests = currentUser.friendRequests.filter(
      (f) => f.toString() !== requesterUserId
    );
    requesterUser.sentFriendRequests = requesterUser.sentFriendRequests.filter(
      (f) => f.toString() !== req.userId
    );

    await Promise.all([currentUser.save(), requesterUser.save()]);

    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Remove friend
router.delete('/friends/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const friendUserId = req.params.userId;

    const [currentUser, friendUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(friendUserId),
    ]);

    if (!currentUser || !friendUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    currentUser.friends = currentUser.friends.filter((f) => f.toString() !== friendUserId);
    friendUser.friends = friendUser.friends.filter((f) => f.toString() !== req.userId);

    await Promise.all([currentUser.save(), friendUser.save()]);

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Get friends list
router.get('/friends', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).populate('friends', '_id name email avatar');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.friends);
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// Get friend requests
router.get('/friends/requests', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).populate('friendRequests', '_id name email avatar');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.friendRequests);
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// Get user profile (for viewing friend's profile)
router.get('/users/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    
    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(targetUserId).select('-password -refreshToken'),
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isFriend = currentUser.friends.some((f) => f.toString() === targetUserId);
    const isOwn = req.userId === targetUserId;

    res.json({
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      avatar: targetUser.avatar,
      bio: targetUser.bio,
      isPrivate: targetUser.isPrivate,
      friendsCount: targetUser.friends?.length || 0,
      isFriend,
      isOwn,
      canViewNotes: isOwn || (isFriend && !targetUser.isPrivate),
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

export default router;
