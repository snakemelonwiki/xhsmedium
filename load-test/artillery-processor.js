module.exports = {
  generateLeadData,
  generatePostData,
};

function generateLeadData(context, events, done) {
  const platforms = ['小红书', '抖音'];
  const budgets = ['5000-10000', '10000-20000', '20000-50000', '50000+'];
  const majors = ['留学咨询', '语言培训', '学历提升', '职业培训', '考研辅导'];

  context.vars.platform = platforms[Math.floor(Math.random() * platforms.length)];
  context.vars.contactInfo = `test${Date.now()}${Math.random().toString(36).substr(2, 5)}@example.com`;
  context.vars.nickname = `测试用户${Date.now()}`;
  context.vars.budget = budgets[Math.floor(Math.random() * budgets.length)];
  context.vars.majorContent = majors[Math.floor(Math.random() * majors.length)];

  return done();
}

function generatePostData(context, events, done) {
  const platforms = ['小红书', '抖音'];
  const postTypes = ['图文', '视频', '直播'];

  context.vars.platform = platforms[Math.floor(Math.random() * platforms.length)];
  context.vars.title = `测试作品${Date.now()}`;
  context.vars.copywriting = `这是负载测试创建的作品内容 ${Math.random().toString(36).substr(2, 10)}`;
  context.vars.postType = postTypes[Math.floor(Math.random() * postTypes.length)];
  context.vars.postUrl = `https://example.com/post/${Date.now()}`;
  context.vars.publishedAt = new Date().toISOString().split('T')[0];

  return done();
}
