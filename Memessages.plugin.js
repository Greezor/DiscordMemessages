/**
 * @name Memessages
 * @author Greezor
 * @authorId 382062281623863298
 * @description Meme notifications
 * @version 0.0.1
 */

const MEOWPAD_API = 'https://api.meowpad.me/v2/sounds/search?q=';

// звук только в текущей конфе (типа закрепка)(фокус)
// окно с браузером звуков и/или подсказки autocomplete
// модификаторы в тексте типа [х2] (проиграть два раза или больше), также отступ и пагинация (может даже громкость/скорость/питч)
// кнопка временно заглушить
// кнопка отменить все текущие звуки (лучше модификатор)
// избранные звуки (может типа мини саундпад или просто коллекция любимых)
// сочетания клавиш для отмены звуков, глушилки и избранного
// история звуков (причём всех, не только своих)
// настройка дефолтной громкости/скорости/питча
// звук уведомления дискорда (или вкл/выкл или даже кастом)
// всплывашки что за звук играет
// добавлять ссылку на звук к сообщению для тех у кого нет плагина
// заменять текст сообщения ссылкой на звук
// резервный сервер myinstants
// прерывать звук если сообщение удалили/отредачили (сочетание для быстрого удаления)
// !!! предупреждение что все данные отправляются на сервер (отключение предупреждения)
// придумать алгоритм отправки куска сообщения на сервер (не факт...)

module.exports = class Memessages {

	constructor(meta)
	{
		this.meta = meta;

		this.launchedAt = 0;
		this.lastMessageID = null;
		this.muted = false;

		this.audios = [];

		this.unrender = () => {};
	}

	get pluginEnabled()
	{
		return !!this.launchedAt;
	}

	set pluginEnabled(value)
	{
		this.launchedAt = value ? Date.now() : null;
	}

	get settings()
	{
		const defaultSettings = {
			memeChannels: [],
		};

		return Object.assign({}, defaultSettings, (
			BdApi.loadData('Memessages', 'settings') ?? {}
		));
	}

	set settings(value)
	{
		BdApi.saveData('Memessages', 'settings', value);
	}

	get dispatcher()
	{
		return BdApi.findModuleByProps('dispatch', 'subscribe');
	}

	get channelStore()
	{
		return BdApi.findModuleByProps('getLastSelectedChannelId');
	}

	fetch(options)
	{
		return new Promise((resolve, reject) => {
			require('request')(options, (error, response, data) => {
				if( error )
					return reject(new Error(error));

				if( response.statusCode != 200 )
					return reject(new Error(response.statusCode));

				return resolve(data);
			});
		});
	}

	get memeIcon()
	{
		const memes = [
			'https://img.icons8.com/fluency/1x/doge.png',
			'https://img.icons8.com/fluency/1x/trollface.png',
			'https://img.icons8.com/fluency/1x/lul.png',
			'https://img.icons8.com/fluency/1x/monkas.png',
			'https://img.icons8.com/fluency/1x/pogchamp.png',
			'https://img.icons8.com/fluency/1x/angry-face-meme.png',
			'https://img.icons8.com/fluency/1x/gachi.png',
			'https://img.icons8.com/color/1x/not-bad-meme.png',
			'https://img.icons8.com/color/1x/feels-guy.png',
			'https://img.icons8.com/color/1x/ugandan-knuckles.png',
			'https://img.icons8.com/color-glass/1x/salt-bae.png',
		];

		return memes[
			Math.floor(Math.random() * memes.length)
		];
	}

	async onMessage({ channelId, message, optimistic })
	{
		if(
			!this.pluginEnabled
			||
			optimistic
			||
			this.lastMessageID == message.id
			||
			!this.settings.memeChannels.includes(channelId)
		)	return;

		this.lastMessageID = message.id;

		const json = await this.fetch({
			url: MEOWPAD_API + encodeURIComponent(message.content),
			headers: {
				'accept-language': 'ru,en',
			},
		});

		const { sounds } = JSON.parse(json);

		if( !sounds.length ) return;

		await this.play(`https://api.meowpad.me/v2/sounds/preview/${ sounds[0].id }.m4a`, {
			props: {
				muted: this.muted,
			},
		});
	}

	async play(url, params)
	{
		const audio = new Audio(url);

		for(let [ prop, value ] of Object.entries(params.props))
			audio[prop] = value;

		this.audios.push(audio);

		audio.addEventListener('canplaythrough', () => {
			audio.play();
		});

		await new Promise(resolve => {
			audio.addEventListener('ended', resolve);
		});

		this.audios.splice(this.audios.indexOf(audio), 1);
	}

	async aggregateAudio(func)
	{
		for(let audio of this.audios)
			await func(audio);
	}

	render()
	{
		const currentLaunch = this.launchedAt;

		const el = (tag, attrs) => {
			let elem = document.createElement(tag);

			for(let [ attr, value ] of Object.entries(attrs))
				elem.setAttribute(attr, value);

			return elem;
		};

		const find = selector => document.querySelector(selector);

		const findAll = selector => document.querySelectorAll(selector);

		const mount = (el, selector, firstMount = true) => {
			const parent = find(selector);

			if( !parent ){
				if( !firstMount )
					document.addEventListener('click', () => {
						setTimeout(() => mount(el, selector, false), 100);
					}, { capture: true, once: true });

				return;
			}

			parent.append(el);

			BdApi.onRemoved(el, () => {
				if( this.launchedAt === currentLaunch )
					mount(el, selector, false);
			});

			if( firstMount )
				this.extendUnrender(() => el.remove());
		};

		

		const muteBtn = el('div', {
			class: `${ find('[class^="winButtonMinMax"]').classList.value } memessages--mute-toggle on`,
		});

		const muteBtnIcon = el('i', { class: 'fa-solid fa-volume-off' });
		muteBtn.append(muteBtnIcon);

		const muteBtnImg = el('img', { src: this.memeIcon });
		muteBtn.append(muteBtnImg);

		muteBtn.addEventListener('click', () => {
			this.muted = !this.muted;
			muteBtn.classList.toggle('on');

			this.aggregateAudio(audio => audio.muted = this.muted);

			if( !this.muted )
				muteBtnImg.setAttribute('src', this.memeIcon);
		});

		mount(muteBtn, '[class^="typeWindows"][class*="titleBar"]');



		const channelBtn = el('div', {
			class: 'memessages--toolbar-btn memessages--channel-btn',
		});

		const channelBtnIconOn = el('i', { class: 'memessages--channel-btn--icon-on fa-solid fa-bell' });
		channelBtn.append(channelBtnIconOn);

		const channelBtnIconOff = el('i', { class: 'memessages--channel-btn--icon-off fa-solid fa-bell-slash' });
		channelBtn.append(channelBtnIconOff);

		const channelBtnImg = el('img', { src: this.memeIcon });
		channelBtn.append(channelBtnImg);

		const currentChannelId = this.channelStore.getChannelId();

		if( !currentChannelId )
			channelBtn.classList.add('hide');

		if( this.settings.memeChannels.includes(currentChannelId) )
			channelBtn.classList.add('on');

		channelBtn.addEventListener('click', () => {
			channelBtn.classList.toggle('on');

			const channelId = this.channelStore.getChannelId();

			if( this.settings.memeChannels.includes(channelId) ){
				this.settings = {
					...this.settings,
					memeChannels: this.settings.memeChannels
						.filter(id => id != channelId),
				};
			}else{
				this.settings = {
					...this.settings,
					memeChannels: [
						...this.settings.memeChannels,
						channelId,
					]
				};

				channelBtnImg.setAttribute('src', this.memeIcon);
			}
		});

		const onChannelChange = ({ channelId }) => {
			if( this.launchedAt != currentLaunch ) return;

			if( channelId ){
				channelBtn.classList.remove('hide');

				if( this.settings.memeChannels.includes(channelId) )
					channelBtn.classList.add('on');
				else
					channelBtn.classList.remove('on');
			}
			else
				channelBtn.classList.add('hide');
		};

		this.dispatcher.subscribe('CHANNEL_SELECT', onChannelChange);
		this.extendUnrender(() => {
			this.dispatcher.unsubscribe('CHANNEL_SELECT', onChannelChange);
		});

		mount(channelBtn, '[class^="toolbar"]');



		const sidebarBtn = el('div', {
			class: 'memessages--toolbar-btn',
		});

		const sidebarBtnIcon = el('i', { class: 'fa-solid fa-bars' });
		sidebarBtn.append(sidebarBtnIcon);

		const sidebarBtnImg = el('img', { src: this.memeIcon });
		sidebarBtn.append(sidebarBtnImg);

		sidebarBtn.addEventListener('click', () => {
			sidebarBtnImg.setAttribute('src', this.memeIcon);
		});

		mount(sidebarBtn, '[class^="toolbar"]');
	}

	extendUnrender(func)
	{
		const beforeUnrender = this.unrender;
		this.unrender = () => {
			beforeUnrender();
			func();
		};
	}

	async start()
	{
		this.pluginEnabled = true;

		this.dispatcher.subscribe('MESSAGE_CREATE', e => this.onMessage(e));

		BdApi.injectCSS('Memessages', `
			@import url("https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.3.0/css/all.min.css");

			.memessages--mute-toggle{
				position: relative;
				z-index: 2;
			}
			
			.memessages--mute-toggle i{
				position: relative;
				transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
			}

			.memessages--mute-toggle i:before{
				clip-path: polygon(0% 0%, 0% 100%, 100% 100%, 100% 90%, 0% 0%, 100% 0%, 100% 55%, 20% 0%);
			}

			.memessages--mute-toggle i:after{
				content: '';
				position: absolute;
				top: 50%;
				left: 50%;
				width: 2px;
				height: 24px;
				margin-top: -12px;
				margin-left: -1px;
				background: currentColor;
				border-radius: 2px;
				transform: rotate(-45deg);
			}

			.memessages--mute-toggle img{
				position: absolute;
				top: 50%;
				left: 50%;
				width: 18px;
				height: 18px;
				margin-top: -9px;
				margin-left: -9px;
				transition: all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
				transform: scale(0) translateY(-2px) rotate(-10deg);
				z-index: -1;
			}

			.memessages--mute-toggle.on i{
				transform: translateX(-7px);
			}

			.memessages--mute-toggle.on i:before{
				clip-path: none;
			}

			.memessages--mute-toggle.on i:after{
				display: none;
			}

			.memessages--mute-toggle.on img{
				transition-timing-function: cubic-bezier(0.34, 7.56, 0.64, 1);
				transform: scale(1) translateX(5px);
			}

			.memessages--toolbar-btn{
				position: relative;
				display: inline-flex;
				justify-content: center;
				align-items: center;
				width: 40px;
				height: 24px;
				cursor: pointer;
			}

			.memessages--toolbar-btn i{
				opacity: 0.85;
			}

			.memessages--toolbar-btn img{
				position: absolute;
				bottom: 0;
				right: 0;
				width: 18px;
				height: 18px;
			}

			.memessages--toolbar-btn:hover i{
				opacity: 1;
			}

			.memessages--channel-btn{
				z-index: 2;
			}

			.memessages--channel-btn.hide{
				display: none;
			}

			.memessages--channel-btn .memessages--channel-btn--icon-on{
				display: none;
			}

			.memessages--channel-btn .memessages--channel-btn--icon-off{
				display: inline-block;
			}

			.memessages--channel-btn.on .memessages--channel-btn--icon-on{
				display: inline-block;
			}

			.memessages--channel-btn.on .memessages--channel-btn--icon-off{
				display: none;
			}

			.memessages--channel-btn.on img{
				animation: memessages--jump 0.5s ease;
			}

			@keyframes memessages--jump{
				0%{
					transform: scale(1);
				}

				50%{
					transform: scale(4);
				}

				100%{
					transform: scale(1);
				}
			}
		`);

		this.render();
	}

	stop()
	{
		this.pluginEnabled = false;

		this.aggregateAudio(audio => audio.pause());
		this.audios = [];

		this.dispatcher.unsubscribe('MESSAGE_CREATE', e => this.onMessage(e));
		BdApi.clearCSS('Memessages');
		this.unrender();

		this.unrender = () => {};
	}

}