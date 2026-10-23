-- What the squadron's AI assistant has spent today, in Neurons.
--
-- The assistant moved from the laptop server's Ollama to Workers AI, which draws on the same free daily
-- allowance as dictation. It gets its own counter so each can stop short on its own and together they stay
-- inside the 10,000 Neurons Cloudflare gives away each day.
ALTER TABLE ai_usage ADD COLUMN chat_neurons REAL NOT NULL DEFAULT 0;
