import React from 'react';
import { createRoot } from 'react-dom/client';
import { OSPreviewProvider } from '../../context/OSContext';
import FarmApp from '../../apps/farm/FarmApp';
import { testCharacter } from './room3d-test-character';

/**
 * 只跑一块田这一个页面，不套手机壳、不需要登录，
 * 用来单独看 HUD 和 3D 构图。OS 上下文只补 addToast。
 * 默认带 testCharacter，这样能直接看到真身 chibi 的动作。
 */
const os = {
    addToast: (text: string) => console.log('[toast]', text),
} as never;

const character = {
    id: 'qa-farm',
    name: '小栗',
    chibiStudio: {
        home3D: { state: testCharacter.state, hair: { layers: {}, extras: [] }, img: '', updatedAt: 0 },
    },
} as never;

createRoot(document.getElementById('root')!).render(
    <OSPreviewProvider value={os}>
        <div style={{ position: 'fixed', inset: 0 }}>
            <FarmApp character={character} onBack={() => console.log('back')} />
        </div>
    </OSPreviewProvider>,
);
