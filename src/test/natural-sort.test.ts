import { describe, it, expect } from 'vitest';
import { naturalCompare } from '../lib/natural-sort';

describe('naturalCompare', () => {
  it('sorts numbers naturally', () => {
    expect(naturalCompare('photo2.jpg', 'photo10.jpg')).toBeLessThan(0);
    expect(naturalCompare('photo10.jpg', 'photo2.jpg')).toBeGreaterThan(0);
    expect(naturalCompare('photo1.jpg', 'photo2.jpg')).toBeLessThan(0);
  });

  it('sorts equal numbers as equal', () => {
    expect(naturalCompare('photo2.jpg', 'photo2.jpg')).toBe(0);
  });

  it('sorts lexicographically for non-numeric parts', () => {
    expect(naturalCompare('abc.jpg', 'abd.jpg')).toBeLessThan(0);
  });

  it('handles mixed numeric and text', () => {
    expect(naturalCompare('img1a.jpg', 'img1b.jpg')).toBeLessThan(0);
    expect(naturalCompare('img2a.jpg', 'img1b.jpg')).toBeGreaterThan(0);
  });

  it('handles paths', () => {
    expect(naturalCompare('sub/photo2.jpg', 'sub/photo10.jpg')).toBeLessThan(0);
  });

  it('handles no numbers', () => {
    expect(naturalCompare('alpha.jpg', 'beta.jpg')).toBeLessThan(0);
  });
});
