import mongoose, { Document, Schema, CallbackWithoutResultAndOptionalError } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  email: string;
  password?: string;
  name: string;
  avatar?: string;
  bio?: string;
  isPrivate: boolean;
  googleId?: string;
  authProvider: 'email' | 'google';
  refreshToken?: string;
  friends: mongoose.Types.ObjectId[];
  friendRequests: mongoose.Types.ObjectId[];
  sentFriendRequests: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true,
      trim: true 
    },
    password: { 
      type: String,
      minlength: 6 
    },
    name: { 
      type: String, 
      required: true,
      trim: true 
    },
    avatar: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      default: '',
      maxlength: 200
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    googleId: {
      type: String,
      sparse: true
    },
    authProvider: {
      type: String,
      enum: ['email', 'google'],
      default: 'email'
    },
    refreshToken: { 
      type: String 
    },
    friends: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    friendRequests: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    sentFriendRequests: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('save', async function(this: IUser, next: CallbackWithoutResultAndOptionalError) {
  if (!this.isModified('password') || !this.password) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', UserSchema);
