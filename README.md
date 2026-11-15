# 地图相册

网站：https://kq-kun.github.io/mothers-memory-map-site/

本公开仓库同时保存源码、测试、加密打包工具和 GitHub Pages 发布文件。照片、地点与生日卡片在 `album.enc.json` 中加密保存；实际姓名、生日、密钥和原始照片不提交。解锁信息只在浏览器本地使用，刷新后需要重新输入。姓名和生日可能被猜中，该方式不等同于服务端访问控制。

## 本地运行

```powershell
node --test tools/*.test.mjs
python -m http.server 4173 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4173/`。解密后先呈现相册，地图引擎独立加载；地图连接失败时仍可浏览照片。加密文件下载显示进度，并在 30 秒后超时返回可重试状态。

## 更新照片

原始相册保存在仓库外，格式沿用原地图相册的 `album.json`、JPEG 照片和 `assets/credits.json`。

```powershell
node tools/encrypt-album.mjs /path/to/plain-album album.enc.json
```

脚本从隐藏标准输入接收 `{name,birthday}`，只写出密文。请勿将真实解锁信息写入命令、脚本或文件。更新加密包时同时修改 `unlock.js` 中的版本参数以避免旧缓存。推送到 `main` 后，Pages 从根目录发布。

目前为六张公共风景示例；作者和许可记录保存在加密包内，解锁后可从“照片来源”查看。尚未加入家庭照片。
