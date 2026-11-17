# 9ue33.github.io

我的个人博客，使用 [Hugo](https://gohugo.io/) + [hugo-theme-reimu](https://github.com/D-Sketon/hugo-theme-reimu) 主题搭建，整体风格改编成《疯狂动物城》朱迪与尼克的可爱元素。

## 本地预览

```bash
hugo server
```

## 文章密码锁

文章 front matter 只写标记，不写密码：

```yaml
password: true             # 开启密码锁
passwordHint: "提示文字"    # 可选，公开提示，显示在输入框上方
```

真正的密码通过环境变量 `BLOG_LOCK_PASSWORD` 提供，不会进入仓库：

- GitHub Actions：在仓库 `Settings → Secrets and variables → Actions` 新建 Secret，名称为 `BLOG_LOCK_PASSWORD`
- 本地构建：在仓库根目录创建 `.blog-lock.env`（已在 `.gitignore` 中），内容为
  `BLOG_LOCK_PASSWORD=你的密码`

```bash
hugo --gc --minify
node tools/blog-lock/encrypt.mjs
```

构建时 `tools/blog-lock/encrypt.mjs` 用密码派生密钥（PBKDF2-SHA256，20 万次迭代），
把正文和目录以 AES-256-GCM 加密后写进页面，生成的 HTML 和 RSS 里都没有明文；
访客输入正确密码后由浏览器（`static/js/blog-lock.js`）解密渲染。同一标签页刷新会记住密码
（sessionStorage），关闭标签页即失效。

`hugo server` 不会执行加密步骤，本地看锁效果请构建后用静态服务器预览 `public/`，
例如 `python -m http.server -d public 8000`。

密码不在仓库里，但文章 Markdown 源文件本身仍在公开仓库中；锁保护的是渲染后的站点，
不是仓库源码。

## 部署

推送代码到 `main` 分支后，GitHub Actions 会自动构建并部署到 GitHub Pages。
