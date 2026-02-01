const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');  // ← 加上这行！

const app = express();
app.use(cors());
app.use(express.json());

// 数据库连接配置
const supabase = createClient(
  'https://prmjdpysdhpbiwrlnstc.supabase.co',
  'sb_secret_EpIlAS84HYEeN4XOjaTD1Q_MKTE9LqN'
);

// 暂时注释掉 OpenAI
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// 健康检查（测试用）
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 获取用户简历（真实数据库）
app.get('/api/profile', async (req, res) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: '需要提供 user_id' });
  }
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user_id)
    .single();
    
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 更新简历（真实数据库）
app.post('/api/profile', async (req, res) => {
  const { user_id, ...profileData } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ error: '需要提供 user_id' });
  }
  
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id, ...profileData, updated_at: new Date() })
    .select();
    
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// AI 优化（临时）
app.post('/api/ai/optimize', async (req, res) => {
  res.json({ 
    message: "AI 功能暂未启用，请先配置 OpenAI API Key",
    optimizedText: "这是占位符，实际功能需要配置 API Key"
  });
});

// 记录申请（临时）
app.post('/api/applications', async (req, res) => {
  res.json({ 
    message: "记录成功（模拟）",
    data: req.body
  });
});

// Vercel Serverless 导出
module.exports = app;

// 本地开发使用
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}