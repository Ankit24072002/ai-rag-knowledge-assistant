import express from 'express';
import Conversation from '../models/Conversation.js';
import { answerQuestion } from '../services/ragService.js';

const router = express.Router();

router.post('/ask', async (req, res) => {
  try {
    const { question, image } = req.body;

    if ((!question || typeof question !== 'string' || !question.trim()) && !image) {
      return res.status(400).json({ message: 'Question or image is required' });
    }

    const cleanQuestion = question?.trim() || 'Analyze this screenshot.';
    const answer = await answerQuestion(cleanQuestion, image);

    const conversation = await Conversation.findOneAndUpdate(
      { userId: 'anonymous' },
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
