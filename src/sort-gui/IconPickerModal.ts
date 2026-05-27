import { App, Modal, TFile, TFolder } from 'obsidian';

export interface IconPickerCallbacks {
	onSelect: (icon: string) => void;
	onClear: () => void;
}

// 统一的图标数据结构：每个图标有分类、图标、名称
interface EmojiItem {
	category: string;
	icon: string;
	name: string;
}

export class IconPickerModal extends Modal {
	private callbacks: IconPickerCallbacks;
	private currentTab: 'custom' | 'emoji' = 'emoji';
	private customIcons: { name: string; path: string }[] = [];
	private emojiTab!: HTMLButtonElement;
	private customTab!: HTMLButtonElement;
	private contentArea!: HTMLElement;
	private emojiSearchInput!: HTMLInputElement;
	private customSearchInput!: HTMLInputElement;
	private selectedIndex: number = 0;

	// 统一的图标数据
	private emojiItems: EmojiItem[] = [
		// 文件
		{ category: '文件', icon: '📄', name: '文件' },
		{ category: '文件', icon: '📝', name: '笔记' },
		{ category: '文件', icon: '📃', name: '文档' },
		{ category: '文件', icon: '📋', name: '剪贴板' },
		{ category: '文件', icon: '📑', name: '书签' },
		{ category: '文件', icon: '📰', name: '报纸' },
		{ category: '文件', icon: '📖', name: '书' },
		{ category: '文件', icon: '📕', name: '关闭的书' },
		{ category: '文件', icon: '📗', name: '绿色书' },
		{ category: '文件', icon: '📘', name: '蓝色书' },
		{ category: '文件', icon: '📙', name: '橙色书' },
		{ category: '文件', icon: '📓', name: '笔记本' },
		{ category: '文件', icon: '📔', name: '带装饰笔记本' },
		{ category: '文件', icon: '📒', name: '账本' },
		{ category: '文件', icon: '🗒️', name: '螺旋笔记本' },
		{ category: '文件', icon: '📜', name: '卷轴' },
		{ category: '文件', icon: '📃', name: '单页文档' },

		// 文件夹
		{ category: '文件夹', icon: '📁', name: '文件夹' },
		{ category: '文件夹', icon: '📂', name: '打开的文件夹' },
		{ category: '文件夹', icon: '🗂️', name: '卡片索引' },
		{ category: '文件夹', icon: '📭', name: '收件箱' },
		{ category: '文件夹', icon: '📪', name: '旗帜邮件' },
		{ category: '文件夹', icon: '📬', name: '张嘴邮件' },
		{ category: '文件夹', icon: '📫', name: '闭嘴邮件' },
		{ category: '文件夹', icon: '📮', name: '邮筒' },
		{ category: '文件夹', icon: '🗃️', name: '文件柜' },
		{ category: '文件夹', icon: '🗄️', name: '存储柜' },
		{ category: '文件夹', icon: '📫', name: '邮件' },
		{ category: '文件夹', icon: '📬', name: '新邮件' },
		{ category: '文件夹', icon: '📧', name: '邮箱' },

		// 箭头/导航
		{ category: '箭头/导航', icon: '▶️', name: '播放' },
		{ category: '箭头/导航', icon: '▶', name: '三角右' },
		{ category: '箭头/导航', icon: '🔽', name: '向下指' },
		{ category: '箭头/导航', icon: '🔼', name: '向上指' },
		{ category: '箭头/导航', icon: '➡️', name: '右箭头' },
		{ category: '箭头/导航', icon: '⬇️', name: '下箭头' },
		{ category: '箭头/导航', icon: '⬅️', name: '左箭头' },
		{ category: '箭头/导航', icon: '➡', name: '黑右箭头' },
		{ category: '箭头/导航', icon: '🔀', name: '双向箭头' },
		{ category: '箭头/导航', icon: '🔁', name: '循环箭头' },
		{ category: '箭头/导航', icon: '🔂', name: '单循环箭头' },
		{ category: '箭头/导航', icon: '↩️', name: '左弯曲箭头' },
		{ category: '箭头/导航', icon: '↪️', name: '右弯曲箭头' },
		{ category: '箭头/导航', icon: '🔃', name: '刷新箭头' },
		{ category: '箭头/导航', icon: '🔄', name: '旋转刷新' },
		{ category: '箭头/导航', icon: '↩', name: '左弯曲' },
		{ category: '箭头/导航', icon: '↪', name: '右弯曲' },

		// 操作/状态
		{ category: '操作/状态', icon: '✅', name: '勾选' },
		{ category: '操作/状态', icon: '❎', name: '叉号' },
		{ category: '操作/状态', icon: '✔️', name: '粗勾' },
		{ category: '操作/状态', icon: '❌', name: '叉' },
		{ category: '操作/状态', icon: '🔴', name: '红圆' },
		{ category: '操作/状态', icon: '🟢', name: '绿圆' },
		{ category: '操作/状态', icon: '🟡', name: '黄圆' },
		{ category: '操作/状态', icon: '⚠️', name: '警告' },
		{ category: '操作/状态', icon: '🔵', name: '蓝圆' },
		{ category: '操作/状态', icon: '🔷', name: '蓝菱形' },
		{ category: '操作/状态', icon: '⭐', name: '星' },
		{ category: '操作/状态', icon: '✨', name: '闪星' },
		{ category: '操作/状态', icon: '💫', name: '星团' },
		{ category: '操作/状态', icon: '🎯', name: '靶心' },
		{ category: '操作/状态', icon: '❓', name: '问号' },
		{ category: '操作/状态', icon: '❗', name: '感叹号' },
		{ category: '操作/状态', icon: '💯', name: '百分号' },
		{ category: '操作/状态', icon: '🔅', name: '低亮度' },
		{ category: '操作/状态', icon: '🔆', name: '高亮度' },

		// 时间/日期
		{ category: '时间/日期', icon: '📅', name: '日历' },
		{ category: '时间/日期', icon: '📆', name: '旋转日历' },
		{ category: '时间/日期', icon: '🗓️', name: '计划日历' },
		{ category: '时间/日期', icon: '📇', name: '索引卡片' },
		{ category: '时间/日期', icon: '⏰', name: '闹钟' },
		{ category: '时间/日期', icon: '⏱️', name: '秒表' },
		{ category: '时间/日期', icon: '🕐', name: '1点' },
		{ category: '时间/日期', icon: '🕑', name: '2点' },
		{ category: '时间/日期', icon: '🕒', name: '3点' },
		{ category: '时间/日期', icon: '🕓', name: '4点' },
		{ category: '时间/日期', icon: '🕔', name: '5点' },
		{ category: '时间/日期', icon: '🕕', name: '6点' },
		{ category: '时间/日期', icon: '🕖', name: '7点' },
		{ category: '时间/日期', icon: '🕗', name: '8点' },
		{ category: '时间/日期', icon: '🕘', name: '9点' },
		{ category: '时间/日期', icon: '🕙', name: '10点' },
		{ category: '时间/日期', icon: '🕚', name: '11点' },
		{ category: '时间/日期', icon: '🕛', name: '12点' },
		{ category: '时间/日期', icon: '⏲️', name: '计时器' },
		{ category: '时间/日期', icon: '🗺️', name: '世界地图' },

		// 通讯/邮件
		{ category: '通讯/邮件', icon: '📨', name: '收到邮件' },
		{ category: '通讯/邮件', icon: '📩', name: '下滑邮件' },
		{ category: '通讯/邮件', icon: '📧', name: '邮件' },
		{ category: '通讯/邮件', icon: '📪', name: '旗帜邮件' },
		{ category: '通讯/邮件', icon: '📫', name: '闭嘴邮件' },
		{ category: '通讯/邮件', icon: '📬', name: '张嘴邮件' },
		{ category: '通讯/邮件', icon: '📭', name: '收件箱' },
		{ category: '通讯/邮件', icon: '📮', name: '邮筒' },
		{ category: '通讯/邮件', icon: '📝', name: '便签' },
		{ category: '通讯/邮件', icon: '📯', name: '邮号' },
		{ category: '通讯/邮件', icon: '📬', name: '新邮件' },
		{ category: '通讯/邮件', icon: '📭', name: '收件' },

		// 工具/设置
		{ category: '工具/设置', icon: '🔍', name: '放大镜左' },
		{ category: '工具/设置', icon: '🔎', name: '放大镜右' },
		{ category: '工具/设置', icon: '🔏', name: '锁' },
		{ category: '工具/设置', icon: '🔐', name: '锁钥匙' },
		{ category: '工具/设置', icon: '🔑', name: '钥匙' },
		{ category: '工具/设置', icon: '🗝️', name: '老钥匙' },
		{ category: '工具/设置', icon: '⚙️', name: '齿轮' },
		{ category: '工具/设置', icon: '🔧', name: '扳手' },
		{ category: '工具/设置', icon: '🔨', name: '锤子' },
		{ category: '工具/设置', icon: '🔩', name: '图钉' },
		{ category: '工具/设置', icon: '🔪', name: '刀' },
		{ category: '工具/设置', icon: '🔫', name: '水枪' },
		{ category: '工具/设置', icon: '🗜️', name: '夹子' },
		{ category: '工具/设置', icon: '⚔️', name: '剑' },
		{ category: '工具/设置', icon: '🔗', name: '链接' },
		{ category: '工具/设置', icon: '⛓️', name: '铁链' },
		{ category: '工具/设置', icon: '🛠️', name: '工具' },

		// 位置/建筑
		{ category: '位置/建筑', icon: '🏠', name: '房子' },
		{ category: '位置/建筑', icon: '🏢', name: '办公楼' },
		{ category: '位置/建筑', icon: '🏥', name: '医院' },
		{ category: '位置/建筑', icon: '🏦', name: '银行' },
		{ category: '位置/建筑', icon: '🏫', name: '学校' },
		{ category: '位置/建筑', icon: '🏭', name: '工厂' },
		{ category: '位置/建筑', icon: '🏪', name: '商店' },
		{ category: '位置/建筑', icon: '🏰', name: '城堡' },
		{ category: '位置/建筑', icon: '🏝️', name: '岛屿' },
		{ category: '位置/建筑', icon: '🏜️', name: '沙漠' },
		{ category: '位置/建筑', icon: '🏔️', name: '雪山' },
		{ category: '位置/建筑', icon: '⛰️', name: '山' },
		{ category: '位置/建筑', icon: '🏕️', name: '露营' },
		{ category: '位置/建筑', icon: '🏖️', name: '海滩' },
		{ category: '位置/建筑', icon: '🏗️', name: '建筑中' },
		{ category: '位置/建筑', icon: '🏚️', name: '废墟' },
		{ category: '位置/建筑', icon: '🏥', name: '医疗' },

		// 学习/研究
		{ category: '学习/研究', icon: '🧠', name: '大脑' },
		{ category: '学习/研究', icon: '💡', name: '灯泡' },
		{ category: '学习/研究', icon: '🎓', name: '毕业帽' },
		{ category: '学习/研究', icon: '📚', name: '书籍' },
		{ category: '学习/研究', icon: '🔬', name: '显微镜' },
		{ category: '学习/研究', icon: '⚗️', name: '烧瓶' },
		{ category: '学习/研究', icon: '🧪', name: '试管' },
		{ category: '学习/研究', icon: '🧬', name: 'DNA' },
		{ category: '学习/研究', icon: '📐', name: '三角尺' },
		{ category: '学习/研究', icon: '📏', name: '直尺' },
		{ category: '学习/研究', icon: '✏️', name: '铅笔' },
		{ category: '学习/研究', icon: '📎', name: '回形针' },
		{ category: '学习/研究', icon: '🔬', name: '研究' },
		{ category: '学习/研究', icon: '🧮', name: '算盘' },
		{ category: '学习/研究', icon: '📋', name: '剪贴板' },
		{ category: '学习/研究', icon: '✒️', name: '黑色钢笔' },

		// 娱乐/创意
		{ category: '娱乐/创意', icon: '🎨', name: '调色板' },
		{ category: '娱乐/创意', icon: '🎭', name: '面具' },
		{ category: '娱乐/创意', icon: '🎪', name: '马戏团帐篷' },
		{ category: '娱乐/创意', icon: '🎬', name: '场记板' },
		{ category: '娱乐/创意', icon: '🎮', name: '游戏手柄' },
		{ category: '娱乐/创意', icon: '🎲', name: '骰子' },
		{ category: '娱乐/创意', icon: '🎸', name: '吉他' },
		{ category: '娱乐/创意', icon: '🎹', name: '钢琴' },
		{ category: '娱乐/创意', icon: '🎺', name: '小号' },
		{ category: '娱乐/创意', icon: '🎻', name: '小提琴' },
		{ category: '娱乐/创意', icon: '🥁', name: '鼓' },
		{ category: '娱乐/创意', icon: '🎵', name: '音符' },
		{ category: '娱乐/创意', icon: '🎶', name: '多音符' },
		{ category: '娱乐/创意', icon: '🎤', name: '麦克风' },
		{ category: '娱乐/创意', icon: '🎧', name: '耳机' },
		{ category: '娱乐/创意', icon: '🎼', name: '乐谱' },
		{ category: '娱乐/创意', icon: '🎯', name: '目标' },

		// 自然/天气
		{ category: '自然/天气', icon: '🌟', name: '五角星' },
		{ category: '自然/天气', icon: '🌙', name: '月亮' },
		{ category: '自然/天气', icon: '☀️', name: '太阳' },
		{ category: '自然/天气', icon: '🌈', name: '彩虹' },
		{ category: '自然/天气', icon: '🌺', name: '芙蓉花' },
		{ category: '自然/天气', icon: '🌸', name: '樱花' },
		{ category: '自然/天气', icon: '🌲', name: '常绿树' },
		{ category: '自然/天气', icon: '🌳', name: '落叶树' },
		{ category: '自然/天气', icon: '🌵', name: '仙人掌' },
		{ category: '自然/天气', icon: '🌴', name: '棕榈树' },
		{ category: '自然/天气', icon: '🍀', name: '四叶草' },
		{ category: '自然/天气', icon: '🌻', name: '向日葵' },
		{ category: '自然/天气', icon: '🌷', name: '郁金香' },
		{ category: '自然/天气', icon: '🌹', name: '玫瑰' },
		{ category: '自然/天气', icon: '🌾', name: '稻子' },
		{ category: '自然/天气', icon: '🌍', name: '地球' },
		{ category: '自然/天气', icon: '🌎', name: '地球美洲' },
		{ category: '自然/天气', icon: '🌏', name: '地球亚洲' },
		{ category: '自然/天气', icon: '🌑', name: '新月' },
		{ category: '自然/天气', icon: '🌒', name: '峨眉月' },
		{ category: '自然/天气', icon: '🌓', name: '上弦月' },
		{ category: '自然/天气', icon: '🌔', name: '盈月' },
		{ category: '自然/天气', icon: '🌕', name: '满月' },
		{ category: '自然/天气', icon: '🌖', name: '亏月' },
		{ category: '自然/天气', icon: '🌗', name: '下弦月' },
		{ category: '自然/天气', icon: '🌘', name: '残月' },
		{ category: '自然/天气', icon: '⛈️', name: '雷雨' },
		{ category: '自然/天气', icon: '🌩️', name: '闪电' },
		{ category: '自然/天气', icon: '❄️', name: '雪花' },
		{ category: '自然/天气', icon: '☁️', name: '云' },
		{ category: '自然/天气', icon: '⛅', name: '阴天' },

		// 心情/情感
		{ category: '心情/情感', icon: '❤️', name: '红心' },
		{ category: '心情/情感', icon: '💜', name: '紫心' },
		{ category: '心情/情感', icon: '💙', name: '蓝心' },
		{ category: '心情/情感', icon: '💚', name: '绿心' },
		{ category: '心情/情感', icon: '🧡', name: '橙心' },
		{ category: '心情/情感', icon: '🩵', name: '浅蓝心' },
		{ category: '心情/情感', icon: '🩷', name: '粉心' },
		{ category: '心情/情感', icon: '🤍', name: '白心' },
		{ category: '心情/情感', icon: '🖤', name: '黑心' },
		{ category: '心情/情感', icon: '💛', name: '黄心' },
		{ category: '心情/情感', icon: '💖', name: '闪红心' },
		{ category: '心情/情感', icon: '💗', name: '双心跳' },
		{ category: '心情/情感', icon: '💕', name: '两颗心' },
		{ category: '心情/情感', icon: '💞', name: '旋转心' },
		{ category: '心情/情感', icon: '💓', name: '心跳' },
		{ category: '心情/情感', icon: '💘', name: '丘比特心' },
		{ category: '心情/情感', icon: '💝', name: '丝带心' },

		// 食物/饮料
		{ category: '食物/饮料', icon: '☕', name: '咖啡' },
		{ category: '食物/饮料', icon: '🍵', name: '茶杯' },
		{ category: '食物/饮料', icon: '🍺', name: '啤酒' },
		{ category: '食物/饮料', icon: '🍷', name: '红酒' },
		{ category: '食物/饮料', icon: '🍕', name: '披萨' },
		{ category: '食物/饮料', icon: '🍔', name: '汉堡' },
		{ category: '食物/饮料', icon: '🍜', name: '面条' },
		{ category: '食物/饮料', icon: '🍣', name: '寿司' },
		{ category: '食物/饮料', icon: '🍰', name: '蛋糕' },
		{ category: '食物/饮料', icon: '🧁', name: '纸杯蛋糕' },
		{ category: '食物/饮料', icon: '🍿', name: '爆米花' },
		{ category: '食物/饮料', icon: '🍩', name: '甜甜圈' },
		{ category: '食物/饮料', icon: '🍪', name: '饼干' },
		{ category: '食物/饮料', icon: '🍫', name: '巧克力' },
		{ category: '食物/饮料', icon: '🍬', name: '糖果' },
		{ category: '食物/饮料', icon: '🍭', name: '棒棒糖' },
		{ category: '食物/饮料', icon: '🍦', name: '冰淇淋' },
		{ category: '食物/饮料', icon: '🍩', name: '甜甜圈' },

		// 交通/旅行
		{ category: '交通/旅行', icon: '✈️', name: '飞机' },
		{ category: '交通/旅行', icon: '🚗', name: '汽车' },
		{ category: '交通/旅行', icon: '🚕', name: '出租车' },
		{ category: '交通/旅行', icon: '🚲', name: '自行车' },
		{ category: '交通/旅行', icon: '⛵', name: '帆船' },
		{ category: '交通/旅行', icon: '🚀', name: '火箭' },
		{ category: '交通/旅行', icon: '🛸', name: '飞碟' },
		{ category: '交通/旅行', icon: '🚁', name: '直升机' },
		{ category: '交通/旅行', icon: '🚂', name: '火车头' },
		{ category: '交通/旅行', icon: '🚢', name: '轮船' },
		{ category: '交通/旅行', icon: '🚌', name: '公交车' },
		{ category: '交通/旅行', icon: '🚑', name: '救护车' },
		{ category: '交通/旅行', icon: '🚒', name: '消防车' },
		{ category: '交通/旅行', icon: '🚓', name: '警车' },
		{ category: '交通/旅行', icon: '🚎', name: '电车' },
		{ category: '交通/旅行', icon: '🚐', name: '小巴' },
		{ category: '交通/旅行', icon: '🚜', name: '拖拉机' },
		{ category: '交通/旅行', icon: '🚲', name: '单车' },

		// 物品/杂项
		{ category: '物品/杂项', icon: '💼', name: '公文包' },
		{ category: '物品/杂项', icon: '📌', name: '图钉' },
		{ category: '物品/杂项', icon: '📎', name: '回形针' },
		{ category: '物品/杂项', icon: '🔗', name: '链接' },
		{ category: '物品/杂项', icon: '💾', name: '软盘' },
		{ category: '物品/杂项', icon: '📀', name: '光盘' },
		{ category: '物品/杂项', icon: '🗜️', name: '夹子' },
		{ category: '物品/杂项', icon: '📦', name: '包裹' },
		{ category: '物品/杂项', icon: '🏺', name: '陶罐' },
		{ category: '物品/杂项', icon: '🛒', name: '购物车' },
		{ category: '物品/杂项', icon: '🛍️', name: '购物袋' },
		{ category: '物品/杂项', icon: '🎁', name: '礼物' },
		{ category: '物品/杂项', icon: '🎀', name: '蝴蝶结' },
		{ category: '物品/杂项', icon: '🏆', name: '奖杯' },
		{ category: '物品/杂项', icon: '🥇', name: '金牌' },
		{ category: '物品/杂项', icon: '🥈', name: '银牌' },
		{ category: '物品/杂项', icon: '🥉', name: '铜牌' },
		{ category: '物品/杂项', icon: '🎖️', name: '勋章' },
		{ category: '物品/杂项', icon: '📿', name: '珠子' },
		{ category: '物品/杂项', icon: '💍', name: '戒指' },
		{ category: '物品/杂项', icon: '👑', name: '皇冠' },
		{ category: '物品/杂项', icon: '🎩', name: '礼帽' },
		{ category: '物品/杂项', icon: '🎒', name: '背包' },
		{ category: '物品/杂项', icon: '👝', name: '小包' },
		{ category: '物品/杂项', icon: '👛', name: '钱包' },
		{ category: '物品/杂项', icon: '👜', name: '手提包' },
		{ category: '物品/杂项', icon: '☂️', name: '雨伞' },
		{ category: '物品/杂项', icon: '🕶️', name: '墨镜' },
		{ category: '物品/杂项', icon: '⌚', name: '手表' },
		{ category: '物品/杂项', icon: '📱', name: '手机' },
		{ category: '物品/杂项', icon: '💻', name: '笔记本' },
		{ category: '物品/杂项', icon: '🖥️', name: '台式机' },
		{ category: '物品/杂项', icon: '⌨️', name: '键盘' },
		{ category: '物品/杂项', icon: '🖱️', name: '鼠标' },
		{ category: '物品/杂项', icon: '💿', name: '光盘' },
		{ category: '物品/杂项', icon: '📷', name: '相机' },
		{ category: '物品/杂项', icon: '📹', name: '摄像机' },
		{ category: '物品/杂项', icon: '📺', name: '电视' },
		{ category: '物品/杂项', icon: '📻', name: '收音机' },
		{ category: '物品/杂项', icon: '🎙️', name: '话筒' },

		// 人像/人物
		{ category: '人物', icon: '👤', name: '人' },
		{ category: '人物', icon: '👥', name: '两个人' },
		{ category: '人物', icon: '🧑', name: '成人' },
		{ category: '人物', icon: '👨', name: '男人' },
		{ category: '人物', icon: '👩', name: '女人' },
		{ category: '人物', icon: '👴', name: '老人' },
		{ category: '人物', icon: '👵', name: '老女人' },
		{ category: '人物', icon: '👶', name: '婴儿' },
		{ category: '人物', icon: '🧒', name: '小孩' },
		{ category: '人物', icon: '👦', name: '男孩' },
		{ category: '人物', icon: '👧', name: '女孩' },

		// 动物
		{ category: '动物', icon: '🐱', name: '猫' },
		{ category: '动物', icon: '🐶', name: '狗' },
		{ category: '动物', icon: '🐭', name: '老鼠' },
		{ category: '动物', icon: '🐹', name: '仓鼠' },
		{ category: '动物', icon: '🐰', name: '兔子' },
		{ category: '动物', icon: '🦊', name: '狐狸' },
		{ category: '动物', icon: '🐻', name: '熊' },
		{ category: '动物', icon: '🐼', name: '熊猫' },
		{ category: '动物', icon: '🐨', name: '考拉' },
		{ category: '动物', icon: '🐯', name: '虎' },
		{ category: '动物', icon: '🦁', name: '狮子' },
		{ category: '动物', icon: '🐮', name: '牛' },
		{ category: '动物', icon: '🐷', name: '猪' },
		{ category: '动物', icon: '🐸', name: '青蛙' },
		{ category: '动物', icon: '🐵', name: '猴' },
		{ category: '动物', icon: '🙈', name: '看不见猴' },
		{ category: '动物', icon: '🙉', name: '不听猴' },
		{ category: '动物', icon: '🙊', name: '不说猴' },
		{ category: '动物', icon: '🐔', name: '鸡' },
		{ category: '动物', icon: '🐧', name: '企鹅' },
		{ category: '动物', icon: '🐦', name: '鸟' },
		{ category: '动物', icon: '🦆', name: '鸭子' },
		{ category: '动物', icon: '🦅', name: '鹰' },
		{ category: '动物', icon: '🦉', name: '猫头鹰' },
		{ category: '动物', icon: '🦋', name: '蝴蝶' },
		{ category: '动物', icon: '🐝', name: '蜜蜂' },
		{ category: '动物', icon: '🐛', name: '毛毛虫' },
		{ category: '动物', icon: '🐞', name: '瓢虫' },
		{ category: '动物', icon: '🐜', name: '蚂蚁' },
		{ category: '动物', icon: '🐢', name: '乌龟' },
		{ category: '动物', icon: '🐍', name: '蛇' },
		{ category: '动物', icon: '🐍', name: '龙' },
		{ category: '动物', icon: '🐲', name: '蜥蜴龙' },
		{ category: '动物', icon: '🦎', name: '蜥蜴' },
		{ category: '动物', icon: '🐙', name: '章鱼' },
		{ category: '动物', icon: '🦑', name: '鱿鱼' },
		{ category: '动物', icon: '🦐', name: '虾' },
		{ category: '动物', icon: '🦀', name: '蟹' },
		{ category: '动物', icon: '🐠', name: '热带鱼' },
		{ category: '动物', icon: '🐟', name: '鱼' },
		{ category: '动物', icon: '🐬', name: '海豚' },
		{ category: '动物', icon: '🐳', name: '鲸鱼' },
		{ category: '动物', icon: '🦈', name: '鲨鱼' },
		{ category: '动物', icon: '🐊', name: '鳄鱼' },
		{ category: '动物', icon: '🐅', name: '豹' },
		{ category: '动物', icon: '🐆', name: '美洲豹' },
		{ category: '动物', icon: '🦓', name: '斑马' },
		{ category: '动物', icon: '🦍', name: '大猩猩' },
		{ category: '动物', icon: '🦧', name: '黑猩猩' },
		{ category: '动物', icon: '🐘', name: '大象' },
		{ category: '动物', icon: '🦛', name: '河马' },
		{ category: '动物', icon: '🦏', name: '犀牛' },
		{ category: '动物', icon: '🐪', name: '骆驼' },
		{ category: '动物', icon: '🦒', name: '长颈鹿' },
		{ category: '动物', icon: '🦘', name: '袋鼠' },
		{ category: '动物', icon: '🐇', name: '兔' },
		{ category: '动物', icon: '🦔', name: '刺猬' },
	];

	constructor(app: App, callbacks: IconPickerCallbacks) {
		super(app);
		this.callbacks = callbacks;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('icon-picker-modal');

		// Header
		const header = contentEl.createDiv('icon-picker-header');
		header.createEl('h3', { text: '选择图标' });

		// Tab buttons
		const tabs = contentEl.createDiv('icon-picker-tabs');
		this.emojiTab = tabs.createEl('button', {
			text: '系统图标',
			cls: this.currentTab === 'emoji' ? 'active' : ''
		});
		this.customTab = tabs.createEl('button', {
			text: '自定义图标',
			cls: this.currentTab === 'custom' ? 'active' : ''
		});

		// Hint text
		const hint = contentEl.createDiv('icon-picker-hint');
		hint.textContent = '点击图标选择 | 按 Tab 切换标签页 | Esc 关闭';

		this.emojiTab.addEventListener('click', () => {
			this.switchTab('emoji');
		});

		this.customTab.addEventListener('click', async () => {
			await this.switchTab('custom');
		});

		// Content area
		this.contentArea = contentEl.createDiv('icon-picker-content');

		// Clear button
		const clearBtn = contentEl.createDiv('icon-picker-clear');
		clearBtn.createEl('button', {
			text: '清除图标',
			cls: 'icon-picker-clear-btn'
		}).addEventListener('click', () => {
			this.callbacks.onClear();
			this.close();
		});

		// Keyboard handler
		this.contentEl.addEventListener('keydown', (e) => this.handleKeydown(e));

		this.renderContent();
	}

	private switchTab(tab: 'emoji' | 'custom'): Promise<void> {
		this.currentTab = tab;
		this.selectedIndex = 0;

		if (tab === 'emoji') {
			this.emojiTab.classList.add('active');
			this.customTab.classList.remove('active');
		} else {
			this.customTab.classList.add('active');
			this.emojiTab.classList.remove('active');
		}

		return this.loadAndRender();
	}

	private async loadAndRender(): Promise<void> {
		if (this.currentTab === 'custom') {
			await this.loadCustomIcons();
		}
		this.renderContent();
	}

	private handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Tab') {
			e.preventDefault();
			if (this.currentTab === 'emoji') {
				this.switchTab('custom');
			} else {
				this.switchTab('emoji');
			}
		} else if (e.key === 'Escape') {
			this.close();
		}
	}

	private renderContent(): void {
		this.contentArea.empty();
		if (this.currentTab === 'emoji') {
			this.renderEmojiPicker();
		} else {
			this.renderCustomIcons();
		}
	}

	private renderEmojiPicker(): void {
		// Search input
		this.emojiSearchInput = this.contentArea.createEl('input', {
			attr: {
				type: 'text',
				placeholder: '输入图标名称搜索...',
			},
			cls: 'icon-picker-search'
		});

		const grid = this.contentArea.createDiv('icon-picker-grid');

		const renderCategories = (filter: string = '') => {
			grid.empty();

			// Group by category
			const grouped = new Map<string, EmojiItem[]>();
			for (const item of this.emojiItems) {
				const matchesFilter = !filter || item.name.toLowerCase().includes(filter.toLowerCase());
				if (matchesFilter) {
					if (!grouped.has(item.category)) {
						grouped.set(item.category, []);
					}
					grouped.get(item.category)!.push(item);
				}
			}

			// Render each category
			for (const [category, items] of grouped) {
				const section = grid.createDiv('icon-picker-category');

				// Category title
				section.createEl('div', {
					text: category,
					cls: 'icon-picker-category-title'
				});

				// Category items - horizontal layout
				const itemsContainer = section.createDiv('icon-picker-category-items');
				for (const item of items) {
					const itemEl = itemsContainer.createDiv('icon-picker-item');
					itemEl.textContent = item.icon;
					itemEl.title = item.name;
					itemEl.addEventListener('click', () => {
						this.callbacks.onSelect(item.icon);
						this.close();
					});
				}
			}

			// Show message if no results
			if (grouped.size === 0 && filter) {
				grid.createDiv('icon-picker-empty', (el) => {
					el.textContent = `未找到包含"${filter}"的图标`;
				});
			}
		};

		// Initial render
		renderCategories();

		// Search handler
		this.emojiSearchInput.addEventListener('input', () => {
			renderCategories(this.emojiSearchInput.value.trim());
		});
	}

	private async loadCustomIcons(): Promise<void> {
		this.customIcons = [];

		// Scan vault for icon folder
		const iconFolder = this.app.vault.getFolderByPath('icon');
		if (iconFolder) {
			await this.scanIconFolder(iconFolder);
		}

		// Also scan .obsidian/icons if exists
		const obsidianIcons = this.app.vault.getFolderByPath('.obsidian/icons');
		if (obsidianIcons) {
			await this.scanIconFolder(obsidianIcons);
		}
	}

	private async scanIconFolder(folder: TFolder): Promise<void> {
		for (const child of folder.children) {
			if (child instanceof TFile) {
				const ext = child.extension.toLowerCase();
				if (['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
					this.customIcons.push({
						name: child.name,
						path: child.path
					});
				}
			} else if (child instanceof TFolder) {
				await this.scanIconFolder(child);
			}
		}
	}

	private renderCustomIcons(): void {
		// Search input
		this.customSearchInput = this.contentArea.createEl('input', {
			attr: {
				type: 'text',
				placeholder: '输入文件名搜索...',
			},
			cls: 'icon-picker-search'
		});

		const grid = this.contentArea.createDiv('icon-picker-grid');
		const customGrid = grid.createDiv('icon-picker-custom-grid');

		const renderIcons = (filter: string = '') => {
			customGrid.empty();

			const filteredIcons = filter
				? this.customIcons.filter(icon =>
					icon.name.toLowerCase().includes(filter.toLowerCase())
				)
				: this.customIcons;

			if (filteredIcons.length === 0) {
				customGrid.createDiv('icon-picker-empty', (el) => {
					el.textContent = filter
						? '未找到匹配的文件'
						: '未找到自定义图标。请在 vault 中创建 icon 文件夹并放入图片文件（svg/png/webp/jpg）';
				});
				return;
			}

			for (const icon of filteredIcons) {
				const item = customGrid.createDiv('icon-picker-item icon-picker-custom');
				// Use proper resource path for images
				const file = this.app.vault.getAbstractFileByPath(icon.path);
				const imgSrc = file instanceof TFile
					? this.app.vault.getResourcePath(file)
					: icon.path;
				item.createEl('img', { attr: { src: imgSrc, alt: icon.name } });
				item.title = icon.name;
				item.addEventListener('click', () => {
					this.callbacks.onSelect(icon.path);
					this.close();
				});
			}
		};

		// Initial render
		renderIcons();

		// Search handler
		this.customSearchInput.addEventListener('input', () => {
			renderIcons(this.customSearchInput.value.trim());
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}