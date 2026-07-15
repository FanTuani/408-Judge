// 返回数组中的最大值。
int maximum(const int* values, int n) {
    int answer = values[0];
    for (int i = 1; i < n; ++i) {
        if (values[i] > answer) answer = values[i];
    }
    return answer;
}
