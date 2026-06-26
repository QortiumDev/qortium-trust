// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TrustGraphModel } from '../graphModel';
import { TrustGraph } from './TrustGraph';

const graph: TrustGraphModel = {
  height: 300,
  links: [],
  nodes: [
    {
      address: 'Qalice',
      level: 1,
      score: 10,
      seedMember: false,
      status: 'GOLD',
      x: 120,
      y: 120,
    },
  ],
  width: 400,
};

describe('TrustGraph wheel zoom', () => {
  it('prevents graph wheel zoom from scrolling the page', () => {
    const pageWheel = vi.fn();
    document.body.addEventListener('wheel', pageWheel);

    try {
      const { container } = render(<TrustGraph graph={graph} onSelect={vi.fn()} profiles={{}} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();

      vi.spyOn(svg as SVGSVGElement, 'getBoundingClientRect').mockReturnValue({
        bottom: 300,
        height: 300,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 120,
        deltaY: -100,
      });

      expect((svg as SVGSVGElement).dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(pageWheel).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('wheel', pageWheel);
    }
  });
});

describe('TrustGraph controls and avatars', () => {
  it('calls the expand toggle from the graph controls', () => {
    const onToggleExpanded = vi.fn();

    render(
      <TrustGraph
        graph={graph}
        onSelect={vi.fn()}
        onToggleExpanded={onToggleExpanded}
        profiles={{}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand graph' }));

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('falls back to the registered-name character when an avatar image fails', () => {
    const { container } = render(
      <TrustGraph
        graph={graph}
        onSelect={vi.fn()}
        profiles={{ Qalice: { address: 'Qalice', avatarSrc: 'http://node/avatar.png', name: 'Alice' } }}
      />,
    );
    const image = container.querySelector('image');

    expect(image).not.toBeNull();
    fireEvent.error(image as SVGImageElement);

    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('.graph-node-initial')?.textContent).toBe('A');
  });
});
