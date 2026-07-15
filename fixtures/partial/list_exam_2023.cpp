// 删除单链表中第一个值为 x 的结点；Node 由题目预定义。
bool erase(Node*& head, int x) {
    Node* previous = nullptr;
    Node* current = head;
    while (current && current->value != x) {
        previous = current;
        current = current->next;
    }
    if (!current) return false;
    if (previous) previous->next = current->next;
    return true;
}
