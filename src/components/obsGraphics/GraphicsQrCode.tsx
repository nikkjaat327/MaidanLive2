import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode as QrIcon } from 'lucide-react';
import type { GraphicsElement } from '../../types/broadcastGraphics.ts';
import { isSafeGraphicsUrl, resolveQrTargetUrl } from './graphicsStyleUtils.ts';

interface GraphicsQrCodeProps {
  element: GraphicsElement;
  matchId?: string;
  tournamentId?: string | null;
}

export const GraphicsQrCode: React.FC<GraphicsQrCodeProps> = React.memo(
  ({ element, matchId, tournamentId }) => {
    const targetUrl = resolveQrTargetUrl(element, { matchId, tournamentId });
    const fgColor = element.qrFgColor || '#0f172a';
    const bgColor = element.qrBgColor || '#ffffff';
    const hasCenterLogo = Boolean(
      element.qrCenterLogoUrl && isSafeGraphicsUrl(element.qrCenterLogoUrl)
    );
    const logoSizePct = Math.min(35, Math.max(10, Number(element.qrCenterLogoSizePct) || 22));
    const [dataUrl, setDataUrl] = useState<string>('');

    useEffect(() => {
      let cancelled = false;
      QRCode.toDataURL(targetUrl, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: hasCenterLogo ? 'H' : 'M',
        color: {
          dark: fgColor.startsWith('#') ? fgColor : '#0f172a',
          light: bgColor.startsWith('#') ? bgColor : '#ffffff',
        },
      })
        .then((url) => {
          if (!cancelled) setDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setDataUrl('');
        });
      return () => {
        cancelled = true;
      };
    }, [targetUrl, fgColor, bgColor, hasCenterLogo]);

    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 select-none">
        <div
          className="relative flex-1 w-full min-h-0 flex items-center justify-center rounded-md overflow-hidden"
          style={{ backgroundColor: bgColor }}
        >
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={element.qrCaption || 'Broadcast QR Code'}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <QrIcon className="w-10 h-10 text-slate-500" />
          )}

          {hasCenterLogo && (
            <div
              className="absolute rounded bg-white p-0.5 shadow-sm flex items-center justify-center overflow-hidden"
              style={{
                width: `${logoSizePct}%`,
                height: `${logoSizePct}%`,
              }}
            >
              <img
                src={element.qrCenterLogoUrl}
                alt="QR Logo"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
          )}
        </div>

        {element.qrCaption && (
          <div
            className="w-full text-center font-bold tracking-wider uppercase truncate leading-tight shrink-0"
            style={{
              color: element.qrCaptionColor || '#ffffff',
              fontSize: Math.max(10, Math.round(Math.min(element.width, element.height) * 0.085)),
            }}
          >
            {element.qrCaption}
          </div>
        )}
      </div>
    );
  }
);

GraphicsQrCode.displayName = 'GraphicsQrCode';
