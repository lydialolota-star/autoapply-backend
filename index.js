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

// OpenAI 配置
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // 等下在 Vercel 设置这个
});

// AI 简历优化接口
app.post('/api/ai/optimize', async (req, res) => {
  const { resumeContent, jobDescription, type } = req.body;
  
  if (!resumeContent || !jobDescription) {
    return res.status(400).json({ error: '需要提供简历内容和职位描述' });
  }

  // 构建 Prompt（针对不同类型优化）
  const typeText = {
    'all': '整份简历',
    'experience': '工作经历部分',
    'projects': '项目经历部分',
    'education': '教育背景部分'
  }[type] || '简历内容';

  const prompt = `你是一位资深HR和简历优化专家，擅长根据目标岗位JD优化简历。请优化以下${typeText}：

【原始内容】：
${resumeContent}

【目标职位JD】：
${jobDescription}

【优化要求】：
1. 提取JD中的关键词，自然融入简历
2. 使用STAR法则重构经历（情境-任务-行动-结果）
3. 量化成果（数字、百分比）
4. 突出与岗位最匹配的技能和经验
5. 保持简洁专业，避免空话
6. 输出可直接使用的文本格式

请直接输出优化后的内容，不要解释：`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",  // 如果有GPT-4访问权限，否则用 "gpt-3.5-turbo"
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    res.json({ 
      optimized: completion.choices[0].message.content,
      model: completion.model,
      usage: completion.usage
    });
  } catch (error) {
    console.error('OpenAI Error:', error);
    res.status(500).json({ error: 'AI优化失败：' + error.message });
  }
});

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
