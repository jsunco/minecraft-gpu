"""Software-only design checks. These never contact Minecraft."""

import unittest

from hardware.iterative_arithmetic_model import (
    Work, divide_round, divide_trace, multiply_round, multiply_trace,
)


class IterativeArithmeticTests(unittest.TestCase):
    def test_every_multiply_pair_and_each_prefix(self):
        for rs in range(256):
            for rt in range(256):
                rounds = multiply_trace(rs, rt)
                self.assertEqual(len(rounds), 8)
                for k, record in enumerate(rounds, 1):
                    self.assertEqual(record.index, k - 1)
                    self.assertEqual(record.after.w,
                                     (rs * (rt % (1 << k))) % 256)
                    self.assertEqual(record.after.m, (rs << k) % 256)
                    self.assertEqual(record.after.q, rt >> k)
                    self.assertEqual(record.take, (rt >> (k - 1)) & 1)
                    if k > 1:
                        self.assertEqual(record.before, rounds[k - 2].after)
                self.assertEqual(rounds[-1].after.w, (rs * rt) % 256)

    def test_every_nonzero_divisor_pair_and_each_prefix(self):
        for dividend in range(256):
            for divisor in range(1, 256):
                rounds = divide_trace(dividend, divisor)
                self.assertEqual(len(rounds), 8)
                for k, record in enumerate(rounds, 1):
                    prefix = dividend >> (8 - k)
                    quotient, remainder = divmod(prefix, divisor)
                    self.assertEqual(record.after.w, remainder)
                    self.assertEqual(record.after.m, divisor)
                    self.assertEqual(record.after.q,
                                     ((dividend << k) % 256) | quotient)
                    self.assertEqual(record.extended_trial_bit, 0)
                    if k > 1:
                        self.assertEqual(record.before, rounds[k - 2].after)
                quotient, remainder = divmod(dividend, divisor)
                self.assertEqual(rounds[-1].after.q, quotient)
                self.assertEqual(rounds[-1].after.w, remainder)

    def test_every_legal_extended_trial_microstate(self):
        seen_extended = False
        for divisor in range(1, 256):
            for remainder in range(divisor):
                for incoming in (0, 1):
                    before = Work(remainder, divisor, incoming << 7)
                    record = divide_round(before, 0)
                    trial = 2 * remainder + incoming
                    expected_take = int(trial >= divisor)
                    self.assertEqual(record.take, expected_take)
                    self.assertEqual(record.after.w,
                                     trial - expected_take * divisor)
                    self.assertLess(record.after.w, divisor)
                    self.assertEqual(record.after.q, expected_take)
                    seen_extended |= bool(record.extended_trial_bit)
        self.assertTrue(seen_extended)
        extended = divide_round(Work(254, 255, 128), 0)
        self.assertEqual((extended.extended_trial_bit, extended.carry,
                          extended.take, extended.after.w), (1, 0, 1, 254))

    def test_bad_bytes_rounds_and_zero_divisors_rejected(self):
        for invalid in (-1, 256, 0.5, True):
            with self.assertRaises(ValueError):
                Work(invalid, 0, 0)
            for trace in (multiply_trace, divide_trace):
                with self.assertRaises(ValueError):
                    trace(invalid, 1)
                with self.assertRaises(ValueError):
                    trace(1, invalid)
        for dividend in range(256):
            with self.assertRaises(ValueError):
                divide_trace(dividend, 0)
        for index in (-1, 8, 0.5, True):
            for step in (multiply_round, divide_round):
                with self.assertRaises(ValueError):
                    step(Work(0, 1, 1), index)
        for bad_state in (Work(0, 0, 0), Work(1, 1, 0), Work(255, 1, 128)):
            with self.assertRaises(ValueError):
                divide_round(bad_state, 0)


if __name__ == "__main__":
    unittest.main()
