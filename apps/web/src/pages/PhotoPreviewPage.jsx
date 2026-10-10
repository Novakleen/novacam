import React, { useEffect, useState } from 'react';
import MediaGrid from '@/components/media/MediaGrid';
import i18n from '@/i18n';

function paint(label, hue, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, `hsl(${hue} 48% 46%)`);
  gradient.addColorStop(1, `hsl(${(hue + 28) % 360} 42% 18%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(w * 0.12, h * 0.28, w * 0.76, h * 0.58);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      ctx.fillRect(w * (0.2 + col * 0.22), h * (0.36 + row * 0.12), w * 0.12, h * 0.07);
    }
  }
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(w / 16)}px sans-serif`;
  ctx.fillText(label, 36, 90);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Dev-only sample grid so the photo layout can be checked without a login.
 * Not linked from navigation.
 */
const PhotoPreviewPage = () => {
  const [media, setMedia] = useState([]);

  useEffect(() => {
    i18n.changeLanguage('fr');
    const shots = [
      ['Façade nord', 200, '2026-10-09T08:12:00'],
      ['Toiture', 24, '2026-10-09T09:40:00'],
      ['Détail joint', 140, '2026-10-09T11:05:00'],
      ['Avant lavage', 210, '2026-10-08T15:20:00'],
      ['Après lavage', 168, '2026-10-08T16:45:00'],
      ['Accès arrière', 280, '2026-10-08T17:10:00'],
    ];
    setMedia(
      shots.map(([label, hue, captured], index) => {
        const url = paint(label, hue, 900, 1200);
        return {
          id: `preview-${index}`,
          file_type: 'image',
          file_url: url,
          thumbnail_url: url,
          web_url: url,
          description: label,
          captured_at: captured,
          created_at: captured,
          latitude: index === 0 ? 50.8503 : null,
          longitude: index === 0 ? 4.3517 : null,
          width: 3024,
          height: 4032,
          uploaded_by_profile: { full_name: 'Luc Martin', initials: 'LM' },
          media_tags: index === 1 ? [{ tag_id: 't1', tags: { name: 'Toiture' } }] : [],
        };
      })
    );
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 px-3 py-4" data-testid="photo-preview">
      <header className="mb-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">Chantier</p>
        <h1 className="text-xl font-bold text-gray-900">Résidence Les Tilleuls</h1>
      </header>
      {media.length > 0 && <MediaGrid media={media} projectId="preview" readOnly />}
    </div>
  );
};

export default PhotoPreviewPage;
