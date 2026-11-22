import React from 'react';
import { createRoot } from 'react-dom/client';
import { OSPreviewProvider } from '../../context/OSContext';
import FarmApp from '../../apps/farm/FarmApp';

/**
 * 只跑一块田这一个页面，不套手机壳、不需要登录，
 * 用来单独看 HUD 和 3D 构图。OS 上下文只补 addToast。
 */
const os = {
    addToast: (text: string) => console.log('[toast]', text),
} as never;

createRoot(document.getElementById('root')!).render(
    <OSPreviewProvider value={os}>
        <div style={{ position: 'fixed', inset: 0 }}>
            <FarmApp onBack={() => console.log('back')} />
        </div>
    </OSPreviewProvider>,
);
