# Photo Clear

一款基于 Expo 的照片清理应用，通过 Tinder 风格的左右滑动快速筛选并批量删除不需要的照片和视频。

## 功能

- **左右滑动清理** — 左滑跳过，右滑标记删除，支持撤销
- **批量删除确认** — 网格预览已标记的照片/视频，确认后批量删除
- **年份筛选** — 按年份过滤，快速定位旧照片
- **实况图支持** — 长按播放 Live Photo 动画（iOS）
- **视频播放** — 卡片内自动循环播放视频
- **触觉反馈** — 滑动操作带震动反馈

## 技术栈

- Expo SDK 54 + React Native 0.81 + React 19
- Expo Router 6（文件系统路由）
- TypeScript（strict 模式）
- react-native-reanimated + react-native-gesture-handler
- expo-media-library / expo-image / expo-video / expo-live-photo

## 开始使用

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 通过 tunnel 启动（远程调试）
npm run start-tunnel

# iOS 模拟器
npm run ios

# Android 模拟器
npm run android
```

## 项目结构

```tree
app/                    # 页面路由
  (tabs)/
    index.tsx           # 首页入口
    clean.tsx           # 滑动清理页面
    clean-confirm.tsx   # 确认删除页面
contexts/
  clean-context.tsx     # 清理状态管理
assets/images/          # 应用图标、启动画面
```
