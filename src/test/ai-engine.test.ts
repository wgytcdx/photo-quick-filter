import { describe, it, expect } from 'vitest';
import { AI_PRESETS } from '../lib/ai-types';
import type { Category } from '../lib/types';
import { CATEGORY_LABELS } from '../lib/constants';

describe('AI_PRESETS', () => {
  it('has 3 presets', () => {
    expect(AI_PRESETS).toHaveLength(3);
  });

  it('each preset has required fields', () => {
    for (const preset of AI_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.prompt).toBeTruthy();
    }
  });

  it('presets contain category keywords', () => {
    for (const preset of AI_PRESETS) {
      expect(preset.prompt).toContain('delete');
      expect(preset.prompt).toContain('keep');
      expect(preset.prompt).toContain('stash');
      expect(preset.prompt).toContain('favorite');
    }
  });

  it('presets request JSON with bucket/confidence/reason', () => {
    for (const preset of AI_PRESETS) {
      expect(preset.prompt).toContain('"bucket"');
      expect(preset.prompt).toContain('"confidence"');
      expect(preset.prompt).toContain('"reason"');
    }
  });

  it('preset IDs are unique', () => {
    const ids = AI_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('CATEGORY_LABELS covers all categories', () => {
    const categories: Category[] = ['delete', 'keep', 'stash', 'favorite'];
    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});
