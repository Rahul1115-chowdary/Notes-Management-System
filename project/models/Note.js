const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Untitled Note'
    },
    content: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      enum: ['general', 'study', 'personal', 'job'],
      default: 'general',
      lowercase: true
    },
    tags: {
      type: [String],
      default: []
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    isPinned: {
      type: Boolean,
      default: false
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    isTrash: {
      type: Boolean,
      default: false
    },
    userEmail: {
      type: String,
      default: 'demo@novanotes.ai'
    },
    attachments: [
      {
        fileName: String,
        fileType: String, // 'image' | 'document'
        fileUrl: String,  // Base64 data URL
        fileSize: Number
      }
    ],
    reminderDate: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Note', NoteSchema);
