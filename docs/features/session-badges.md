# Session Badge Notifications

**Date**: 2026-02-27
**Commit**: `24df0c5e`
**Branch**: `main`

## 功能描述

在会话列表、侧边栏和标签栏上添加视觉徽章指示器（红点/蓝点），帮助用户快速识别需要关注的会话。

- **Action badge（红色，脉冲动画）**：会话需要用户授权或回答
- **Info badge（蓝色，静态）**：AI 完成了工作，用户尚未查看
- **Badge 计数**：Sessions 标签和侧边栏标题显示待处理数量
- **紧凑视图**：使用彩色状态点代替头像徽章

## 修改文件

### App (`packages/happy-app/`)

| 文件 | 改动 |
|------|------|
| `sources/components/ActiveSessionsGroup.tsx` | 活跃会话分组组件添加徽章显示 |
| `sources/components/ActiveSessionsGroupCompact.tsx` | 紧凑视图添加彩色状态点 |
| `sources/components/SessionsList.tsx` | 会话列表添加徽章计数 |
| `sources/components/SidebarView.tsx` | 侧边栏标题显示待处理数 |
| `sources/components/TabBar.tsx` | 标签栏添加徽章计数 |

## 关键设计决策

1. **两种徽章类型**：红色（需要操作）vs 蓝色（信息通知），优先级不同
2. **脉冲动画**：Action badge 使用脉冲动画吸引注意力
3. **紧凑模式适配**：小屏幕下用状态点代替头像上的徽章
4. **仅 App 端改动**：不涉及 CLI 或 Server 变更
