import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n=== Chrome Web Store API - Refresh Token 获取工具 ===\n');
  console.log('请先确保您已在 Google Cloud Console 启用了 Chrome Web Store API，');
  console.log('并在“凭证”中创建了 OAuth 客户端 ID（应用类型选择“桌面应用”）。\n');

  const clientId = (await question('1. 请输入您的 Client ID: ')).trim();
  const clientSecret = (await question('2. 请输入您的 Client Secret: ')).trim();

  if (!clientId || !clientSecret) {
    console.error('❌ 错误：Client ID 和 Client Secret 不能为空！');
    rl.close();
    return;
  }

  // 生成授权 URL
  const redirectUri = 'https://localhost';
  const scope = 'https://www.googleapis.com/auth/chromewebstore';
  const authUrl = `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  console.log('\n================================================================');
  console.log('👉 请复制并在浏览器中打开以下网址进行授权：');
  console.log('================================================================');
  console.log(authUrl);
  console.log('================================================================\n');
  console.log('提示：授权同意后，浏览器会跳转到一个无法访问的 localhost 页面（如 https://localhost/?code=4/xxxx）。');
  console.log('请从浏览器地址栏中，将 code= 后面直到 & 之前的所有字符复制下来。\n');

  const authCode = (await question('3. 请粘贴浏览器重定向 URL 中的 code 值: ')).trim();

  if (!authCode) {
    console.error('❌ 错误：授权码 (code) 不能为空！');
    rl.close();
    return;
  }

  console.log('\n正在向 Google OAuth 服务器换取 Refresh Token...');

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authCode,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('\n❌ 获取失败，Google API 返回错误：', data.error_description || data.error);
    } else if (data.refresh_token) {
      console.log('\n================================================================');
      console.log('🎉 恭喜！成功获取 Refresh Token！');
      console.log('================================================================');
      console.log(`CHROME_REFRESH_TOKEN:\n\n${data.refresh_token}\n`);
      console.log('================================================================');
      console.log('请将此 Token 复制并配置到 GitHub 仓库 Secrets 的 CHROME_REFRESH_TOKEN 变量中。');
    } else {
      console.log('\n⚠️ 未在返回的数据中找到 refresh_token，请确认授权步骤是否正确。');
      console.log('Google 返回的原始数据：', data);
    }
  } catch (error) {
    console.error('\n❌ 网络请求发生错误：', error.message);
  }

  rl.close();
}

main().catch(console.error);
