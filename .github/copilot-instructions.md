# Photo Clear 项目指南

## 技术栈

- **框架**: Expo SDK 54 + React Native 0.81 + React 19
- **路由**: Expo Router 6（文件系统路由），启用了 `typedRoutes`
- **语言**: TypeScript（strict 模式）
- **样式**: `StyleSheet.create`
- **新架构**: 已启用 `newArchEnabled` 和 `reactCompiler`
- **路径别名**: `@/*` 映射到项目根目录
- **动画/手势**: react-native-reanimated + react-native-gesture-handler + react-native-worklets
- **媒体**: expo-media-library（相册读取/删除）、expo-image（图片）、expo-video（视频播放）、expo-live-photo（实况图）

## 项目结构

```
app/                    # 页面路由（文件系统路由）
  _layout.tsx           # 根布局（Stack）
  (tabs)/               # 分组路由
    _layout.tsx         # 分组布局（GestureHandlerRootView + CleanProvider）
    index.tsx           # 首页（照片清理入口）
    clean.tsx           # 清理页面（Tinder 风格左右滑动）
    clean-confirm.tsx   # 确认删除页面（网格预览 + 批量删除）
contexts/               # 状态管理（非路由文件）
  clean-context.tsx     # 清理状态 Context + Reducer
assets/images/          # 静态图片资源（应用图标、启动画面）
```

## 编码规范

- 使用函数组件 + `export default` 导出页面
- 非页面文件（Context、工具函数等）不放在 `app/` 目录下，避免被 Expo Router 识别为路由
- 样式优先使用 `tailwindcss` 工具类，推荐配合 `className` 属性和 `nativewind` 使用
- 如遇无法覆盖的场景，可补充使用 `StyleSheet.create`，并将样式定义放在组件文件底部

示例：

```tsx
<View className='flex-1 bg-white p-4'>
  <Text className='text-lg font-bold text-gray-900'>Hello</Text>
</View>
```

// 如需自定义动画、复杂样式，可结合 StyleSheet.create：

```tsx
const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
})
```

- 页面跳转使用 `expo-router` 的 `Link` 组件或 `useRouter` Hook
- 所有组件文件使用 `.tsx` 扩展名
- 遵循 `eslint-config-expo` 规则
- 使用 `scheduleOnRN` 替代已废弃的 `runOnJS`（来自 `react-native-worklets`）

## 常用命令

- `npm start` — 启动开发服务器
- `npm run start-tunnel` — 通过 tunnel 启动（远程调试）
- `npm run ios` — iOS 模拟器运行
- `npm run android` — Android 模拟器运行
- `npm run web` — 浏览器运行
- `npm run lint` — ESLint 检查
