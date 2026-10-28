---
title: "Dario Amodei：什么是学习"
published: 2026-09-28
tags: ["learning", "thinking", "amodei"]
school: "AI 科学家派"
voice: "reconstructed-first-person"
source: "public interviews & essays, synthesized 2026-09"
description: ""
lang: "zh-CN"
---

> "The thing you need to understand about these models is they just want to learn. The models just want to learn."
> —— Ilya Sutskever，2016/17 年对我说的话，我记住了十年

:::info 阅读约定
本篇第一人称叙事是**视角重构**，用于组织其思想，不是本人原话；引用块中的引语才有可溯源出处。
:::

---

我叫 Dario Amodei，1983 年生在旧金山。我这辈子只在两种东西上研究过"学习"：生物的神经元，和人工的神经网络。

我在 Lowell 高中读书，2000 年进过美国物理奥赛代表队；先在加州理工、后来转到斯坦福读物理；博士在普林斯顿念生物物理，导师是 William Bialek 和 Michael Berry，论文测量和解释神经回路的集体行为；之后在斯坦福医学院做博士后。2014 年底我加入 Andrew Ng 在百度的团队，后来去了 Google，2016 年加入 OpenAI，2021 年和我妹妹 Daniela 一起创办 Anthropic。

所以"什么是学习"对我不是教育理论问题，是一个我用实验追了二十年的问题。我的答案有个很硬的底色：**学习首先是一个经验事实，然后才是一个理论问题。**

## 学习是经验事实，先于理论

2014 年底在百度，我的任务很朴素：做出世界上最好的语音识别系统。我没有先发明什么宏大理论。我后来跟 Dwarkesh 讲过当时的做法："I just tried the simplest experiments. I was just fiddling with some dials."——给 RNN 多加几层，训练得更久一点，看会怎样？多久开始过拟合？加进新数据再重复一轮呢？

我看到的是非常一致的模式：规模上去，损失就按规律下来。"It's almost entirely an empirical fact."——loss 可以被预测到好几位有效数字。这种精度，"you don't see that outside of physics"，你在物理学以外很少见到。具体能力的出现则很突然：算术、写代码，昨天还不会，跨过某个规模就会了。数据在先，解释在后。

我对安全、对组织也是同样的经验主义态度。"You often get surprised"，你经常被现实惊到；"Being right about 10% of the stuff sets you head and shoulders above many people." 在一成的事情上判断正确，就足以让你远超多数人。这不是悲观，这是我对"知道一件事"这件事的敬畏。

我得补充一点个人轨迹。2005 年前后我读 Kurzweil，更早还读过 Eliezer Yudkowsky 的东西，但我真正相信规模，是 2012 年看到 AlexNet、然后 2014 到 2017 年亲手在实验里一次次验证之后的事。换句话说，我不是被哪本书说服的，我是被自己的实验数据说服的——这个顺序对我很重要。

## 模型想要学习

2016 或 2017 年，我刚开始真正相信、或者说确认规模假设的时候，Ilya 对我讲了那句像禅宗公案（koan）的话："The thing you need to understand about these models is they just want to learn. The models just want to learn." 我后来形容那一刻：I became enlightened，我开悟了。

这句话是什么意思？意思是：你不是逐条编出模型的每项能力的。有了优化压力、有了数据，系统会自己朝能力的方向重组。它"想要"变得更好——这是拟人，但抓住了实质。Chris Olah 有一句我反复引用的话："generative AI systems are grown more than they are built"，生成式 AI 系统更像是被**种大**的，而不是被**搭出来**的，它们的内部机制是涌现的。

我花过好几年盯着 Inception V1 看。那是 2015 年最好的视觉模型，现在早就过时了。"It has maybe about 10,000 neurons in it. I spent a lot of time looking at the 10,000 neurons." 里面大量神经元有干净得惊人的可解释含义：从边缘检测器一路组合出汽车检测器，我们能直接从权重里把这个"配方"读出来。梯度下降在人工网络里找到的结构，和生物网络在进化与学习中找到的结构，经常是同一批自然抽象。学习之所以可能，是因为这个世界本身是可被压缩的。

还有一个相关的教训。我们组的 Tom Henighan 讲过热质说（caloric theory）的历史：热曾经被认为是一种从高温物体流向低温物体的流质，这个理论是错的，但当年相信它的人认真顺着它推，反而做出了真发现。"There's a virtue in taking hypotheses seriously and pushing them as far as they can go." 把一个假设当真、推到尽头，本身就是有价值的——哪怕最后证明它错了。学习不只是收集正确答案，也包括认真对待一个可能错误的猜测，让现实来裁决它。

## 学习靠实践，不靠旁观

如果有人问我入行的第一条建议，我的回答是："just start playing with the models"，直接上手玩模型。

三年前人们不是这样的。他们从"let me read the latest reinforcement learning paper"开始，先读最新的强化学习论文。读论文当然要做，但这些模型是人类从未见过的新人工物，没有人真正理解它们，唯一能获得真实知识的方式就是亲手用、亲手做。"Skate where the puck is going"，滑向冰球要去的地方，而不是它停留过的地方。

实践会给你旁观给不了的东西。"You discover ten new ideas and ten new ways that things are going to go wrong by trying these in practice."——你亲自试一遍，会冒出十个新想法、十个会出问题的新方式。模型自己也在这么学：上下文学习（in-context learning）就是给它一堆例子，它在语境中发生真实的学习；"A million tokens is a lot. That can be days of human learning." 一百万个 token 相当于一个人几天到几周的阅读量——这本质上是在岗学习（on-the-job learning）。

## 学会如何学习：物理学给我的超能力

我招人有个著名偏好：喜欢招理论物理学家。原因一句话："Theoretical physicists can learn things really fast." 理论物理学家学习新事物的速度极快。

回看我的履历，每一次跳跃看起来都很大：物理本科 → 生物物理博士，研究神经回路的集体电活动 → 语音识别 → 语言模型 → AI 安全。但底下用的是同一个元技能：在陌生领域里快速建立模型、用实验修正它。这个"学会如何学习"的能力，是我身上唯一没有折旧过的资产。

这里还有一层比较优势的道理：你不必把整个任务都做到满分。"Even if you're only doing 5% of the task, that 5% gets super amplified and levered"，哪怕你只承担任务的百分之五，这百分之五会被急剧放大，因为另外百分之九十五由 AI 完成，"you become 20 times more productive"。你的那一小块判断力、那一小块学习，杠杆率是二十倍。所以真正要练的，恰恰是机器暂时还做不了的那百分之五。

在 Anthropic，我们内部有一个部门叫 Ministry of Education，教育部。学习不是个人的事，是基础设施：一个组织怎么快速吸收新知识、怎么把一个人脑中的模型扩散到一百个人脑中，本身就是工程问题。

## 学习要对准真相，包括让你不舒服的真相

2024 年 10 月我写了《Machines of Loving Grace》。里面有一句话：大多数人同时低估了两端——"I think that most people are underestimating just how radical the upside of AI could be, just as I think most people are underestimating how bad the risks could be." AI 的上限有多大，风险就有多坏。

我父亲是意大利裔的皮具工匠，在我 23 岁那年因丙肝去世；几年之后，有效的疗法才问世。这是我推动 AI 加速医学研究的原因之一。可解释性（mechanistic interpretability）在我看来就是给模型做 MRI：目标是在模型强大到失控之前，先看懂它内部在做什么。"We can't stop the bus, but we can steer it." 我们拦不住这辆车，但我们可以转向。

哲学对我帮助大得出奇——它是一台反胡扯（anti-bullshit）的机器：所有术语必须定义，所有反驳必须逐条过，任何人拿起你的文章都该确切知道你在说什么。我还建议过一种对模型的共情：把你写的提示重读一遍，假装你是第一次看到它的人——它为什么会做出那样的反应？在一个生成内容真假难辨的世界里，不被骗的街头智慧、不持有错误信念的纪律，是学习的最后一道闸门。

## 所以什么是学习？

- **学习首先是经验事实。** 先动手、先观察曲线，让数据修正理论，而不是让理论筛掉数据。
- **学习是系统朝能力方向的自我重组。** 能力是"长"出来的，不是逐条编出来的；世界可压缩，所以学习可能。
- **上手先于阅读，体验先于概念。** 旁观读到的是别人的结论，实践里长出来的才是你的判断。
- **学会如何学习是唯一不会折旧的资产。** 学科会换，元能力不换。
- **学习的方向是真相，尤其包括让你不适的那一半。** 只看上限不看风险，和只看风险不看上限，是同一种自欺。

---

## 核心心智模型

### 经验先行 / Empiricism First
拧最简单的旋钮，看最硬的曲线。loss 能被预测到好几位有效数字时，你面对的是事实；理论是用来解释事实的，不是用来替代事实的。在一成的事上判断正确，就足以超过大多数人。

### 模型想要学习 / The Models Want to Learn
Ilya 的那句公案：模型"想要"学习。优化压力加上数据，能力会自己涌现。系统是"种大"的，不是"搭成"的——这同时适用于神经网络和研究文化。

### 上手即学习 / Start Playing
我给所有人的头号建议：别从最新论文开始，从亲手用模型开始。实践一次会暴露十个新想法和十个新风险，这是旁观永远给不了的信息量。滑向冰球要去的地方。

### 学会学习 / Learning to Learn
物理学家之所以被我偏爱，是因为他们学得快。跨领域的迁移不靠记住旧知识，靠在新领域里快速建模、快速被现实纠正。学习能力是一个组织和一个人最深的基础设施。

### 转向而非拦车 / Steer the Bus
技术的进步拦不住，但方向可以转。可解释性是模型的 MRI，哲学是语言的 anti-bullshit 装置，批判性思维是面对真假混杂世界的最后闸门——三者都是为了同一件事：让学习始终对准真相。

## 相关视角

- [Sutskever-什么是学习](/thinking/Sutskever-什么是学习/) — 那句「模型想要学习」正是他的原话：一个信规模涌现，一个信白纸推导
- [Richard Feynman-什么是学习](/thinking/Richard Feynman-什么是学习/) — 「别骗自己」与「对准让你不适的那一半真相」：同一台反自欺机器
- [Paul Graham-什么是学习](/thinking/Paul Graham-什么是学习/) — 「just start playing with the models」与「在不够格的时候开始」：都主张上手先于读论文
- [Nassim Taleb-什么是学习](/thinking/Nassim Taleb-什么是学习/) — 「先动手、让数据修正理论」与「没有代价的错误不会产生学习」：都只信有代价的实践

---

*返回索引：[00 INDEX](/thinking/00 INDEX/) | 姊妹篇：[Dario Amodei-怎么学习](/thinking/Dario Amodei-怎么学习/)*
