import express from 'express';
import Conversation from '../models/Conversation.js';
import { answerQuestion } from '../services/ragService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 }).lean();
    res.status(200).json({ conversations });
  } catch (error) {
    console.error('Conversation list error:', error);
    res.status(500).json({ message: 'Unable to load conversations' });
  }
});

router.post('/conversations', authMiddleware, async (req, res) => {
  try {
    const { title = 'New conversation' } = req.body || {};
    const conversation = await Conversation.create({ userId: req.user._id, sessionId: req.user.email, title, messages: [] });
    res.status(201).json({ conversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Unable to create conversation' });
  }
});

router.delete('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    res.status(200).json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ message: 'Unable to delete conversation' });
  }
});

router.post('/ask', authMiddleware, async (req, res) => {
  try {
    const { question, image, conversationId } = req.body;

    if ((!question || typeof question !== 'string' || !question.trim()) && !image) {
      return res.status(400).json({ message: 'Question or image is required' });
    }

    const cleanQuestion = question?.trim() || 'Analyze this screenshot.';
    const answer = await answerQuestion(cleanQuestion, image);

    const conversation = conversationId
      ? await Conversation.findOneAndUpdate(
          { _id: conversationId, userId: req.user._id },
          {
            $push: {
              messages: {
                $each: [
                  { role: 'user', content: cleanQuestion },
                  { role: 'assistant', content: answer.answer },
                ],
              },
            },
          },
          { new: true }
        )
      : await Conversation.findOneAndUpdate(
          { userId: req.user._id },
          {
            $push: {
              messages: {
                $each: [
                  { role: 'user', content: cleanQuestion },
                  { role: 'assistant', content: answer.answer },
                ],
              },
            },
          },
          {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          }
        );

    res.status(200).json({
      answer: answer.answer,
      sources: answer.sources,
      conversationId: conversation._id,
      conversation: conversation,
    });
  } catch (error) {
    console.error('Chat route error:', error);
    res.status(500).json({
      message: 'Error generating answer',
      error: error.message,
    });
  }
});

export default router;
