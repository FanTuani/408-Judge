# 参考讲解

闭区间二分令 right = n - 1，每轮排除 middle 本身，即更新为 middle + 1 或 middle - 1。时间 O(log n)。
