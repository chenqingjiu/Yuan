import React, { useRef, useState } from 'react';
import type { CharacterProfile, DialogueApiConfig } from '../../types';
import { useOS } from '../../context/OSContext';
import { describeDialogueApi, pickDialogueApi } from '../../utils/characterApi';
import { configFromPreset, findActivePresetId } from '../../utils/apiPresetSwitch';
import { extractModelIds } from '../../utils/modelList';
import { extractContent, safeResponseJson } from '../../utils/safeApi';
import { fetchLlm } from '../../utils/anthropicApi';
import DialogueApiFields from '../settings/DialogueApiFields';
import ModelPicker from '../settings/ModelPicker';
import ApiPresetGroups from '../settings/ApiPresetGroups';
import { CharAvatar } from '../games/CharAvatar';

/**
 * 群成员各自的对话模型。
 *
 * 为什么不直接塞 CharacterApiPanel：那个组件自带一个 Modal，而群设置本身也是 Modal。
 * 两层 fixed + slide 动画的祖先会互相裁剪/抢层级，手机上很容易点不开。所以这里把
 * 同一套字段（预设 / URL / Key / 模型列表 / 测连接）改成**内联展开**，不弹第二层。
 *
 * 写入的位置仍是 CharacterProfile.dialogueApi —— 群聊轮询模式发言时由
 * resolveDialogueApi 逐人读取，因此这里配完立刻生效，且和角色编辑页里那份是同一处。
 */
export default function MemberModelList({ members }: { members: CharacterProfile[] }) {
    const { apiConfig, apiPresets, availableModels, updateCharacter, addToast } = useOS();
    const [openId, setOpenId] = useState<string | null>(null);
    const [draft, setDraft] = useState<DialogueApiConfig | null>(null);
    const [models, setModels] = useState<string[]>([]);
    const [picker, setPicker] = useState(false);
    const [pickerModel, setPickerModel] = useState('');
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState('');
    // 换服务商后，上一家的模型列表不能污染下一家
    const requestVersion = useRef(0);

    const reset = () => {
        requestVersion.current += 1;
        setOpenId(null);
        setDraft(null);
        setModels([]);
        setPicker(false);
        setLoading(false);
        setTesting(false);
        setStatus('');
    };

    const openFor = (char: CharacterProfile) => {
        if (openId === char.id) { reset(); return; }
        requestVersion.current += 1;
        const source = char.dialogueApi || apiConfig;
        setOpenId(char.id);
        setDraft(pickDialogueApi(source));
        setModels(source.baseUrl === apiConfig.baseUrl && source.apiKey === apiConfig.apiKey ? availableModels : []);
        setPicker(false);
        setLoading(false);
        setTesting(false);
        setStatus('');
    };

    const changeDraft = (patch: Partial<DialogueApiConfig>) => {
        requestVersion.current += 1;
        setLoading(false);
        setTesting(false);
        setStatus('');
        if (patch.baseUrl !== undefined || patch.apiKey !== undefined || patch.apiType !== undefined) setModels([]);
        setDraft(prev => prev ? { ...prev, ...patch } : prev);
    };

    const fetchModels = async () => {
        if (!draft) return;
        const api = pickDialogueApi(draft);
        if (!api.baseUrl) { setStatus('请先填写 API URL'); return; }
        const version = ++requestVersion.current;
        setLoading(true);
        setStatus('');
        try {
            const response = await fetchLlm(`${api.baseUrl}/models`, { headers: { Authorization: `Bearer ${api.apiKey || 'sk-none'}` } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const next = extractModelIds(await response.json());
            if (version !== requestVersion.current) return;
            setModels(next);
            setStatus(next.length ? `获取到 ${next.length} 个模型` : '模型列表为空，可手动输入');
            setPickerModel(api.model || next[0] || '');
            setPicker(true);
        } catch (error) {
            if (version === requestVersion.current) setStatus(`获取失败：${error instanceof Error ? error.message : '请检查配置'}`);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    };

    const testConnection = async () => {
        if (!draft) return;
        const api = pickDialogueApi(draft);
        const version = ++requestVersion.current;
        setTesting(true);
        setStatus('');
        try {
            const response = await fetchLlm(`${api.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey || 'sk-none'}` },
                body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5, stream: api.stream ?? false }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const content = extractContent(await safeResponseJson(response));
            if (version === requestVersion.current) setStatus(content ? '连接成功' : '接口已响应，但回复为空');
        } catch (error) {
            if (version === requestVersion.current) setStatus(`连接失败：${error instanceof Error ? error.message : '请检查配置'}`);
        } finally {
            if (version === requestVersion.current) setTesting(false);
        }
    };

    const save = (char: CharacterProfile) => {
        if (!draft) return;
        const api = pickDialogueApi(draft);
        if (!api.baseUrl || !api.model) { setStatus('请填写 API URL 和模型'); return; }
        try {
            const url = new URL(api.baseUrl);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
        } catch { setStatus('请填写有效的 HTTP / HTTPS API 地址'); return; }
        updateCharacter(char.id, { dialogueApi: api });
        addToast(`已保存 ${char.name} 的模型`, 'success');
        reset();
    };

    const followGlobal = (char: CharacterProfile) => {
        updateCharacter(char.id, { dialogueApi: undefined });
        addToast(`${char.name} 改回跟随设置中的 API`, 'info');
        reset();
    };

    const activePreset = draft ? findActivePresetId(apiPresets, draft) : null;

    if (!members.length) return null;

    return <div className="space-y-2">
        <p className="text-[9px] text-slate-400 leading-tight">
            轮询模式下生效：每位成员发言时各自调用这里配置的模型，没配的跟随「设置」里的主 API。导演模式只用一个模型，这里的配置不参与。改完立即生效，不用重启。
        </p>
        {members.map(char => {
            const open = openId === char.id;
            const own = char.dialogueApi;
            return <div key={char.id} className={`rounded-xl border transition-all ${open ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200 bg-white'}`}>
                <button
                    type="button"
                    onClick={() => openFor(char)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left active:scale-[0.99] transition-transform"
                >
                    <CharAvatar
                        value={char.avatar}
                        name={char.name}
                        imgClassName="w-7 h-7 rounded-lg object-cover shrink-0"
                        fallbackClassName="w-7 h-7 rounded-lg bg-slate-100 text-xs flex items-center justify-center shrink-0 overflow-hidden"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-700 truncate">{char.name}</span>
                        <span className={`block text-[10px] truncate ${own ? 'text-violet-500' : 'text-slate-400'}`}>
                            {own ? describeDialogueApi(own) : `跟随设置 · ${describeDialogueApi(apiConfig)}`}
                        </span>
                    </span>
                    <span className="text-[10px] font-bold text-violet-500 shrink-0">{open ? '收起' : '换模型'}</span>
                </button>

                {open && draft && <div className="px-3 pb-3 space-y-3 border-t border-violet-100 pt-3">
                    {apiPresets.length > 0 && <div className="space-y-1">
                        <h4 className="text-[10px] font-bold text-slate-400 tracking-widest">API 预设</h4>
                        <ApiPresetGroups presets={apiPresets}>{preset => <button key={preset.id} type="button"
                            onClick={() => changeDraft(configFromPreset(preset))}
                            className={`rounded-lg px-3 py-2 text-xs border ${activePreset === preset.id ? 'bg-violet-50 border-violet-300 text-violet-600' : 'bg-white border-slate-200 text-slate-600'}`}>
                            {preset.name}{activePreset === preset.id ? ' · 已选' : ''}
                        </button>}</ApiPresetGroups>
                    </div>}

                    <DialogueApiFields
                        value={draft}
                        onChange={changeDraft}
                        fetchModels={fetchModels}
                        isLoadingModels={loading}
                        openModelPicker={() => { setPickerModel(draft.model); setPicker(true); }}
                    />

                    {picker && <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <ModelPicker
                            availableModels={models}
                            localModel={pickerModel}
                            setLocalModel={setPickerModel}
                            confirmModelPicker={model => { changeDraft({ model }); setPicker(false); }}
                        />
                    </div>}

                    <button type="button" onClick={testConnection} disabled={testing || !draft.baseUrl.trim() || !draft.model.trim()}
                        className="w-full py-2 rounded-xl border border-violet-200 text-violet-600 text-xs font-bold disabled:opacity-40">
                        {testing ? '测试中…' : '测试连接'}
                    </button>
                    {status && <p role="status" className="text-[10px] text-slate-500 break-words">{status}</p>}

                    <div className="flex gap-2">
                        <button type="button" onClick={() => reset()} className="flex-1 py-2 bg-slate-100 text-slate-500 text-xs font-bold rounded-xl">取消</button>
                        {own && <button type="button" onClick={() => followGlobal(char)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-500 text-xs font-bold rounded-xl">跟随设置</button>}
                        <button type="button" onClick={() => save(char)} className="flex-1 py-2 bg-violet-500 text-white text-xs font-bold rounded-xl">保存</button>
                    </div>
                </div>}
            </div>;
        })}
    </div>;
}
