
# Photo Clear Constitution

## Core Principles

### I. 技术栈与结构唯一性

所有核心功能基于 Expo SDK 54、React Native 0.81、React 19 实现，采用 Expo Router 6 文件系统路由，TypeScript（strict）为唯一开发语言。页面与非页面文件严格分离，所有组件文件使用 .tsx 扩展名。

### II. 组件与样式规范

页面组件必须为函数组件并使用 export default 导出。样式统一采用 StyleSheet.create 定义，样式代码置于组件文件底部。页面跳转仅允许使用 expo-router 的 Link 组件或 useRouter Hook。

### III. 状态与动画一致性

状态管理通过 Context（如 clean-context.tsx）集中实现，动画与手势仅允许使用 react-native-reanimated、react-native-gesture-handler、react-native-worklets。

### IV. 测试与代码质量

所有代码需通过 eslint-config-expo 规则校验。新功能需配套单元测试或集成测试，确保主要用户路径可独立验证。禁止跳过测试或以注释替代。

### V. 依赖与升级约束

依赖包升级需兼容现有功能，主依赖（Expo/React Native/TypeScript）升级需评估迁移影响并记录。路径别名 @/* 仅映射到项目根目录。

## 附加约束

- 仅允许使用项目指南中列明的依赖与技术栈。
- 禁止将非页面文件放入 app/ 目录。
- 静态资源仅存放于 assets/images/。
- 禁止引入未审查的第三方库。
- 生产构建前必须通过 lint 检查。

## 开发流程与质量门槛

- 所有变更需经代码评审，评审人需核查是否符合本宪法原则。
- 新功能开发需先补充/更新测试用例。
- 重要依赖升级需在 PR 说明中列明兼容性影响。
- 代码合并前必须通过所有自动化检查（lint、测试）。

## Governance

- 本宪法高于一切团队惯例与历史做法。
- 任何修订需经团队成员共识并记录修订日期与版本。
- 修订需同步更新相关模板与开发文档。
- 所有 PR/评审需明确核查宪法合规性。
- 运行时开发指导请参考 .github/copilot-instructions.md。

**Version**: 1.0.0 | **Ratified**: 2026-02-25 | **Last Amended**: 2026-02-25
<!-- Version: 1.0.0 | Ratified: 2026-02-25 | Last Amended: 2026-02-25 -->
