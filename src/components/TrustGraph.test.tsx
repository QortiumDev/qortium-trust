// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TrustGraphModel } from '../graphModel';
import { TrustGraph } from './TrustGraph';

const graph: TrustGraphModel = {
  height: 300,
  links: [],
  nodes: [
    {
      address: 'Qalice',
      inboundWeight: 0,
      linkCount: 0,
      level: 1,
      outboundWeight: 0,
      radius: 14,
      score: 10,
      seedMember: false,
      status: 'GOLD',
      x: 120,
      y: 120,
    },
  ],
  width: 400,
};
const linkedGraph: TrustGraphModel = {
  ...graph,
  links: [
    {
      category: 'SUBJECT',
      confidence: 2,
      id: 'Qalice-Qbob-SUBJECT',
      rating: 3,
      source: 'Qalice',
      target: 'Qbob',
    },
    {
      category: 'SUBJECT',
      confidence: 1,
      id: 'Qbob-Qalice-SUBJECT',
      rating: -1,
      source: 'Qbob',
      target: 'Qalice',
    },
  ],
  nodes: [
    graph.nodes[0],
    {
      address: 'Qbob',
      inboundWeight: 6,
      linkCount: 2,
      level: 0,
      outboundWeight: 1,
      radius: 20,
      score: 0,
      seedMember: false,
      status: 'UNVERIFIED',
      x: 260,
      y: 120,
    },
  ],
};
const obstructedGraph: TrustGraphModel = {
  height: 300,
  links: [
    {
      category: 'SUBJECT',
      confidence: 1,
      id: 'Qalice-Qbob-SUBJECT',
      rating: 1,
      source: 'Qalice',
      target: 'Qbob',
    },
  ],
  nodes: [
    {
      ...graph.nodes[0],
      x: 80,
      y: 120,
    },
    {
      address: 'Qmiddle',
      inboundWeight: 0,
      linkCount: 0,
      level: 0,
      outboundWeight: 0,
      radius: 22,
      score: 0,
      seedMember: false,
      status: 'UNVERIFIED',
      x: 180,
      y: 120,
    },
    {
      address: 'Qbob',
      inboundWeight: 1,
      linkCount: 1,
      level: 0,
      outboundWeight: 0,
      radius: 14,
      score: 0,
      seedMember: false,
      status: 'UNVERIFIED',
      x: 280,
      y: 120,
    },
  ],
  width: 400,
};

class MockImage {
  static instances: MockImage[] = [];

  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = '';

  constructor() {
    MockImage.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockImage.instances = [];
});

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

  it('renders directional arrows and a compact selected-node panel', () => {
    const onOpenDetail = vi.fn();
    const { container } = render(
      <TrustGraph
        graph={linkedGraph}
        onOpenDetail={onOpenDetail}
        onSelect={vi.fn()}
        profiles={{ Qalice: { address: 'Qalice', avatarSrc: null, name: 'Alice' } }}
        selectedAddress="Qalice"
      />,
    );
    const links = container.querySelectorAll('.graph-link');

    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('marker-end')).toBe('url(#trust-arrow-positive)');
    expect(links[1]?.getAttribute('marker-end')).toBe('url(#trust-arrow-negative)');
    expect(links[0]?.getAttribute('d')).toContain('Q');
    expect(links[1]?.getAttribute('d')).toContain('Q');
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Ratings received')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View details' }));
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ address: 'Qalice' }));
  });

  it('provides the rendered relationships as an accessible textual list', () => {
    render(
      <TrustGraph
        graph={linkedGraph}
        onSelect={vi.fn()}
        profiles={{
          Qalice: { address: 'Qalice', avatarSrc: null, name: 'Alice' },
          Qbob: { address: 'Qbob', avatarSrc: null, name: 'Bob' },
        }}
      />,
    );

    const list = screen.getByRole('list', { name: 'Ratings' });
    const items = Array.from(list.querySelectorAll('li')).map((item) => item.textContent);

    expect(items).toEqual([
      'Alice (Qalice) → Bob (Qbob): 3 (confidence 2)',
      'Bob (Qbob) → Alice (Qalice): -1 (confidence 1)',
    ]);
  });

  it('clears the selected node when the graph background is clicked', () => {
    const onClearSelection = vi.fn();

    render(
      <TrustGraph
        graph={linkedGraph}
        onClearSelection={onClearSelection}
        onSelect={vi.fn()}
        profiles={{ Qalice: { address: 'Qalice', avatarSrc: null, name: 'Alice' } }}
        selectedAddress="Qalice"
      />,
    );

    fireEvent.click(screen.getByRole('group', { name: 'Trust graph' }));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('curves a link around a non-endpoint node on its direct path', () => {
    const { container } = render(
      <TrustGraph graph={obstructedGraph} onSelect={vi.fn()} profiles={{}} />,
    );

    expect(container.querySelector('.graph-link')?.getAttribute('d')).toContain('Q');
  });

  it('selects a node when the pointer starts on the node', () => {
    const onSelect = vi.fn();

    render(
      <TrustGraph
        graph={linkedGraph}
        onSelect={onSelect}
        profiles={{ Qalice: { address: 'Qalice', avatarSrc: null, name: 'Alice' } }}
      />,
    );
    const node = screen.getByRole('button', { name: /Alice/ });

    fireEvent.pointerDown(node, { button: 0, clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.click(node);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: 'Qalice' }));
  });

  it('renders an avatar image only after the source preloads successfully', async () => {
    vi.stubGlobal('Image', MockImage);

    const { container } = render(
      <TrustGraph
        graph={graph}
        onSelect={vi.fn()}
        profiles={{ Qalice: { address: 'Qalice', avatarSrc: 'http://node/avatar.png', name: 'Alice' } }}
      />,
    );

    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('.graph-node-initial')?.textContent).toBe('A');

    MockImage.instances[0]?.onload?.();

    await waitFor(() => expect(container.querySelector('image')).not.toBeNull());
  });

  it('keeps the registered-name character when an avatar image fails to preload', async () => {
    vi.stubGlobal('Image', MockImage);

    const { container } = render(
      <TrustGraph
        graph={graph}
        onSelect={vi.fn()}
        profiles={{ Qalice: { address: 'Qalice', avatarSrc: 'http://node/avatar.png', name: 'Alice' } }}
      />,
    );

    expect(container.querySelector('image')).toBeNull();

    MockImage.instances[0]?.onerror?.();

    await waitFor(() => expect(container.querySelector('.graph-node-initial')?.textContent).toBe('A'));
    expect(container.querySelector('image')).toBeNull();
  });
});
