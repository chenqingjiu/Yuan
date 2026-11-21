import React from 'react';
import { isImageValue, useBlobRefUrl } from '../../utils/blobRef';

/**
 * 游戏里的角色头像。
 *
 * 角色头像有两种存法（见 utils/blobRef.ts）：
 *   · 用户上传的图 → `blobref:b_xxx` 令牌，必须先解析成 objectURL 才能喂给 <img>
 *   · emoji / 名字首字 → 直接当文字画出来
 *
 * 直接写 `<img src={char.avatar}>` 会因为浏览器不认 `blobref:` 协议而变成破图占位。
 * hook 必须无条件调用，所以先解析、再判断这张图到底存不存在。
 */
export function CharAvatar({
    value,
    name,
    imgClassName,
    fallbackClassName,
}: {
    value?: string | null;
    name: string;
    imgClassName?: string;
    fallbackClassName?: string;
}) {
    const url = useBlobRefUrl(value ?? undefined);
    const isImage = isImageValue(value);

    if (isImage && url) {
        return <img src={url} alt="" className={imgClassName} draggable={false} />;
    }

    return <span className={fallbackClassName}>{isImage ? name.slice(0, 1) : value || name.slice(0, 1)}</span>;
}

export default CharAvatar;
