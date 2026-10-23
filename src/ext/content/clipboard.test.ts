import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  const textarea = {
    value: '',
    setAttribute: vi.fn(),
    style: {},
    select: vi.fn(),
  };
  const body = { appendChild: vi.fn(), removeChild: vi.fn() };
  const execCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('document', { createElement: vi.fn(() => textarea), body, execCommand });
    vi.stubGlobal('navigator', {});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await copyToClipboard('Markdown');
    expect(writeText).toHaveBeenCalledWith('Markdown');
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('falls back when the async clipboard API is denied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    execCommand.mockReturnValue(true);
    await copyToClipboard('Markdown');
    expect(textarea.value).toBe('Markdown');
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it('reports failed legacy copies instead of reporting success', async () => {
    execCommand.mockReturnValue(false);
    await expect(copyToClipboard('Markdown')).rejects.toThrow('Unable to copy');
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it('cleans up the temporary input when the legacy API throws', async () => {
    execCommand.mockImplementation(() => { throw new Error('Copy denied'); });
    await expect(copyToClipboard('Markdown')).rejects.toThrow('Copy denied');
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });
});
