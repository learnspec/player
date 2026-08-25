---
title: QuizMD demo
description: A short tour of the QuizMD question types this player supports.
partial_scoring: true
---

# QuizMD demo

This quiz exercises all five QuizMD question types, mcq, multi, open,
match, and order, plus per-question hints, explanations, and inline math.

## What is the capital of France?

- [ ] Lyon
- [x] Paris
- [ ] Marseille
- [ ] Nice

> Paris has been the capital of France since the late 10th century.

```quiz
points: 1
hint: "It's also the name of a Greek prince in the Iliad."
```

## Which of these are prime numbers?

Select all that apply.

- [x] 2
- [ ] 4
- [x] 7
- [ ] 9
- [x] 13

> A prime number has exactly two distinct positive divisors: 1 and itself.
> 4 = 2×2 and 9 = 3×3, so neither is prime.

```quiz
points: 2
```

## True or false: $0$ is an even number.

- [x] True
- [ ] False

> 0 is divisible by 2 with no remainder, so it's even.

## What is the value of $\int_0^1 x^2 \, dx$?

Fill in the blank: $\int_0^1 x^2\,dx = $ ___.

**Answer:** 1/3

> $\int_0^1 x^2\,dx = \left[\frac{x^3}{3}\right]_0^1 = \frac{1}{3}$

```quiz
hint: "Use the power rule for integration: ∫xⁿdx = xⁿ⁺¹/(n+1)."
```

## Match each planet with its position from the Sun.

```quiz
type: match
points: 3
```

| Planet | Position |
|--------|----------|
| Mercury | 1st |
| Venus | 2nd |
| Earth | 3rd |

## Place these numbers in ascending order.

```quiz
type: order
points: 2
```

1. One
2. Two
3. Three
4. Four
