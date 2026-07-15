// 在升序数组中查找 target。
int binarySearch(const int* values, int n, int target) {
    int left = 0, right = n;
    while (left <= right) {
        int middle = (left + right) / 2;
        if (values[middle] == target) return middle;
        if (values[middle] < target) left = middle;
        else right = middle;
    }
    return -1;
}
