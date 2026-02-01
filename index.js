const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// 数据库连接（你的 Supabase）
const supabase = createClient(
  'https://prmjdpysdhpbiwrlnstc.supabase.co',  // 换成你的真实URL
  'sb_secret_EpIlAS84HYEeN4XOjaTD1Q_MKTE9LqN'  // 换成你的真实service_role key
);

// OpenAI 配置（关键！）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // 从环境变量读取
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 获取简历
app.get('/api/profile', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: '需要提供 user_id' });
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user_id)
    .single();
    
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 保存简历
app.post('/api/profile', async (req, res) => {
  const { user_id, ...profileData } = req.body;
  if (!user_id) return res.status(400).json({ error: '需要提供 user_id' });
  
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id, ...profileData, updated_at: new Date() })
    .select();
    
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// AI 优化接口（核心功能）
app.post('/api/ai/optimize', async (req, res) => {
  const { resumeContent, jobDescription, type } = req.body;
  
  if (!resumeContent || !jobDescription) {
    return res.status(400).json({ error: '需要提供简历内容和职位描述' });
  }

  const typeText = {
    'all': '整份简历',
    'experience': '工作经历部分',
    'projects': '项目经历部分',
    'skills': '技能描述部分'
  }[type] || '简历内容';

  const prompt = `你是一位资深HR和简历优化专家。请优化以下${typeText}：

【原始简历内容】：
${resumeContent}

【目标职位JD】：
${jobDescription}

【优化要求】：
1. 提取JD中的关键词自然融入
2. 使用STAR法则（情境-任务-行动-结果）
3. 量化成果（用数字、百分比）
4. 突出匹配岗位的技能和经验
5. 专业简洁，避免空话套话

请直接输出优化后的内容，不要解释：`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",  // 建议先用3.5便宜，效果好再换gpt-4
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    res.json({ 
      optimized: completion.choices[0].message.content,
      model: completion.model
    });
  } catch (error) {
    console.error('OpenAI Error:', error);
    res.status(500).json({ 
      error: 'AI优化失败：' + (error.message || '未知错误') 
    });
  }
});

// 记录申请（可选）
app.post('/api/applications', async (req, res) => {
  res.json({ message: "功能开发中" });
});

// Vercel 导出
module.exports = app;

// 本地开发
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

