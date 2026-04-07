"use client";

import React from "react";
import { Disclosure } from "./disclosure";

type EventItem = {
  id: string;
  uid: string;
  title: string;
  link: string | null;
  date?: string | null;
  imageUrl: string | null;
};

export default function EventsLayout() {
  const [events, setEvents] = React.useState<EventItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const API_BASE = "https://sector.fm/api/query";

  const fetchKql = async (kql: string) => {
    const url = `${API_BASE}?query=${encodeURIComponent(kql)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`KQL ${res.status}: ${kql}`);
    const json = await res.json();
    return json?.result ?? null;
  };

  // Safely wrap a string as a KQL string literal: page("…")
  const kqlString = (s: string) =>
    `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  const absoluteUrl = (maybe: string | null | undefined) => {
    if (!maybe) return null;
    if (/^https?:\/\//i.test(maybe)) return maybe;
    try {
      return new URL(maybe, "https://sector.fm").toString();
    } catch {
      return `https://sector.fm${maybe.startsWith("/") ? "" : "/"}${maybe}`;
    }
  };

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // 1) Get just the IDs of all children under /events (avoids partial objects).
        const ids: string[] = await fetchKql(`page('events').children.pluck('id')`);
        if (!mounted) return;

        if (!Array.isArray(ids) || ids.length === 0) {
          setEvents([]);
          setLoading(false);
          return;
        }

        // 2) Hydrate each page by id: content + first file url
        const items: EventItem[] = await Promise.all(
          ids.map(async (id) => {
  const safeId = kqlString(id); // e.g., page("events/some-event")
  const title: string =
    (await fetchKql(`page(${safeId}).title`)) ?? id.split("/").pop() ?? "(Untitled)";

  const content: any = await fetchKql(`page(${safeId}).content`);
  const link = absoluteUrl(String(content?.Link ?? content?.link ?? "")) || null;
  const date = String(content?.Date ?? content?.date ?? "") || null;

  let imageUrl: string | null = null;
  try {
    const firstFileUrl = await fetchKql(`page(${safeId}).files.first.url`);
    imageUrl = absoluteUrl(
      typeof firstFileUrl === "string" ? firstFileUrl : firstFileUrl?.url
    );
  } catch {
    imageUrl = null;
  }

  return { id, uid: id.split("/").pop() || id, title, link, date: date || null, imageUrl };
          })
        );


        if (mounted) setEvents(items);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <p className="text-black">Loading events…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!events.length) return <p className="text-black">No events found.</p>;

  return (
    <Disclosure
      defaultOpen={false}
      className="bg-white [&_svg]:text-black"
      summary={<h2 className="text-black font-bold text-xl text-center">Events</h2>}
    >
      <div className="bg-white relative">
        <ul className="events">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-col">
              <a
                href={ev.link ?? "#"}
                className="reset-anchor block"
                target="_blank"
                rel="noopener"
                onClick={(e) => {
                  if (!ev.link) e.preventDefault();
                }}
                title={ev.title}
                aria-label={`Open ${ev.title}`}
              >
                {ev.imageUrl ? (
                  <img
                    src={ev.imageUrl}
                    alt={ev.title}
                    className="event-img"
                    width={200}
                    height={200}
                  />
                ) : (
                  <div className="event-img placeholder" aria-hidden />
                )}
                <figcaption className="event-caption">
                  <div className="text-black font-bold text-sm line-clamp-2">{ev.title}</div>
                  {ev.date && <div className="text-xs text-gray-600 mt-1">{ev.date}</div>}
                  {!ev.link && (
                    <div className="text-[11px] text-red-700 mt-1">No Link found for this event</div>
                  )}
                </figcaption>
              </a>
            </li>
          ))}
        </ul>

        <style jsx>{`
  .events {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr); /* 👈 fixed 4 per row */
    gap: 16px;
    padding-bottom: 16px;
  }

  /* Responsiveness: drop to 2 columns on small screens */
  @media (max-width: 768px) {
    .events {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 480px) {
    .events {
      grid-template-columns: 1fr;
    }
  }

  .event-img {
    width: 100%;
    aspect-ratio: 4 / 5;   /* 👈 portrait format */
    display: block;
    object-fit: cover;
    border-radius: 4px;
    background: #111;
  }

  .event-img.placeholder { background: #222; }

  .event-caption {
    margin-top: 6px;
    line-height: 1.3;
    color: #000;
    font-size: 0.85rem;
  }

  .reset-anchor {
    text-decoration: none;
    color: inherit;
  }

  .reset-anchor:hover .event-caption div:first-child {
    text-decoration: underline;
  }
`}</style>

      </div>
    </Disclosure>
  );
}
