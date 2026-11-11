# 2.5D Fluid Lab v2 — Mobile GPU Visual / Performance A/B Benchmark

独立、无外部依赖的 HTML5/WebGL2 研究 Demo，用于比较低成本的 2D 火焰渲染（Performance）与更复杂的 2.5D 视觉方案（Visual Fidelity）在**同一部手机、相同负载**下的表现。

## 运行

- 手机：用 Chrome、Edge 或 Safari 打开提供的 HTTPS 固定版本链接，保持浏览器前台、屏幕常亮。
- 离线：浏览器打开 `index.html` 或在解压目录运行 `python -m http.server 8765`，访问 `http://localhost:8765`。
- 默认是 **Visual Fidelity**（96×96、30 Hz、8 次压力迭代、8 层伪体积采样）。可点 **Performance** 切换成 V1 的轻量模式。
- 点 **「两种模式 × 4 档 A/B 测试」**，大约一分钟内依次测完八组，顺序为每档 Performance 后接 Fidelity，保持设置与火焰数量相同。
- 测试完成后，点击「导出 JSON 报告」，发送该文件以比较每档耗时、帧时间、GPU 性能（如设备支持计时扩展）。

## 八组测试

| 负载 | 分辨率 / 更新 | 火焰实例 | 独立流体模拟 | 比较模式 |
|---|---|---:|---:|---|
| Low | 64×64 / 20 Hz | 1 | 1 | Performance vs Fidelity |
| Balanced | 96×96 / 30 Hz | 4 | 1 | Performance vs Fidelity |
| Many | 96×96 / 30 Hz | 16 | 4 | Performance vs Fidelity |
| Extreme | 128×128 / 60 Hz | 64 | 8 | Performance vs Fidelity |

每档预热 1.3 秒，正式采样 4.5 秒。极限档可能对低阶手机很吃力；需要时可手动先运行低档或缩小火焰数量。

## 技术栈与视觉

- **Performance:** RGBA8 的二维 Semi-Lagrangian 速度场与热/烟字段平流、可选近似压力投影，轻量一次纹理显示。
- **Visual Fidelity:** 增加 curl/vorticity-confinement GPU pass、热量与烟雾分别演化、流体信息引导的程序式火焰形状、多层深度偏移采样的伪体积显示、噪声卷曲烟带、火焰颜色分层、火星和光晕。
- Visual Fidelity 是 **hybrid（真实 2D 流体 + art-directed shader）**，不是完整三维流体求解，也不是原 X 作者的源码或 Ubisoft 的 Poisson Filters 实现。
- 观察角度 slider 是**伪摄像机角度**，主要控制采样偏移，不代表真实 3D 几何遮挡。
- 可自由修改独立模拟份数、模拟解像度、每秒模拟次数、压力迭代、伪体积层数、烟雾和涡流强度。

## 指标与限制

- **FPS、P50/P95/P99、卡顿比例**：来自 `requestAnimationFrame` 相邻回调的帧间隔，受刷新率、省电、温控、浏览器前后台影响。FPS 触及屏幕刷新率时，不能仅凭 FPS 判断两种模式的 GPU 成本。
- **GPU P50 / P95（可选）**：仅当设备支持 `EXT_disjoint_timer_query_webgl2` 时记录，统计一个帧内 WebGL 模拟和渲染命令的 GPU 时间，不包含浏览器最终合成。扩展不可用则显示 N/A；对比倍率退回帧间隔并标注。
- **CPU Submit**：仅 JS 发出 WebGL 命令耗时，不能代表 GPU 时间。
- **WebGL2 不支持**：会进入明显标记的 Canvas2D 简易动画；这**不是** GPU 流体模拟，无法做有效的同类 A/B 对比。
- 压测每档样本较短，只是初筛。正式评估应连续运行 10–15 分钟确认热节流和长期卡顿，最好反复测试 3 次取中位数。

## 隐私与许可

不包含遥测请求、不依赖任何外部 CDN，只有主动导出或分享时数据才离开设备。视觉参考：<https://x.com/r4nM4_64/status/2120431026191344067>；代码和美术 Shader 为独立实现，未使用原作者素材与程序。

代码所在 GitHub 分支：<https://github.com/JustSomeCodeUser/hello-world/tree/fluid-lab-demo-20261112>，未修改原仓库的默认分支。