import type { MarkerId, MarkerRange } from '@core/model';
import type { TimelineEvent } from '@core/markdown/pull';
import type { SlicePullTimelineResult } from './types';

function findEventIndex(events: TimelineEvent[], marker: MarkerId): number {
  return events.findIndex((event) => {
    if (!('id' in event)) {
      return false;
    }
    return event.type === marker.type && event.id === marker.id;
  });
}

export function slicePullTimeline(events: TimelineEvent[], range?: MarkerRange): SlicePullTimelineResult {
  if (!range?.start && !range?.end) {
    return { events };
  }

  if (!events.length) {
    return { error: 'No timeline events were found for this PR.' };
  }

  const startIndex = range.start ? findEventIndex(events, range.start) : 0;
  const endIndex = range.end ? findEventIndex(events, range.end) : events.length - 1;

  if (startIndex === -1 || endIndex === -1) {
    return { error: 'Selected marker could not be found in the PR timeline.' };
  }

  let start = startIndex;
  let end = endIndex;
  let warning: string | undefined;

  if (start > end) {
    [start, end] = [end, start];
    warning = 'Markers were reversed, so the export range was swapped.';
  }

  return {
    events: events.slice(start, end + 1),
    warning,
  };
}
