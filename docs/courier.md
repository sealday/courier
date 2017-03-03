
参考 [node_redis 错误处理说明](https://github.com/NodeRedis/node_redis#error-handling--v26)

所有 redis 的错误都作为 ReplyError 的对象返回。无论是因为什么原因而导致没有正常执行的命令
都将返回一个 AbortError 的对象。有一个 AbortError 的子类  AggregateError 存在。


类库先实现 FIFO 队列
几个状态 
ready 
active 可转为 done 或 failed
done
failed 可转为 ready 和 delayed
delayed 可转为 ready

手动干预的情况下，理论上都可以互相转换，但是只需要满足，将 failed 或者 done 转为 ready

阻塞读取只处理 ready 状态

在不考虑类型的时候，阻塞读取还是很好用的，但是考虑类型之后，阻塞读取就暴露出问题来了

有两个思路，一个是，不分类型队列，阻塞读取一直读同一个队列，判断读到的内容，然后分发给监听器。
这样做需要考虑把没打算处理的任务放回队列中，但是放回队列中会导致顺序可能改变（因为其他人可能也在读取）

另一个是，针对类型队列来读取，这样避免了放回队列的操作。不过这里会因为是阻塞队列，所以需要建立多个客户端连接。

如果是通知读取（发布订阅）的话，需要考虑的是加锁和通知丢失。

然后通过包装多条队列，实现优先级队列（同等优先级的情况下仍然按照 FIFO 来实现）

除了ready以外的状态是不是应该考虑不用队列，队列长了的时候，效率会下降（O(n)）