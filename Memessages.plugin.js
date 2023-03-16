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
		this.channelFocus = null;
		this.muted = false;

		this.unrender = () => {};
	}

	get pluginEnabled()
	{
		return !!this.launchedAt;
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
			(
				!!this.channelFocus
				&&
				this.channelFocus != channelId
			)
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

		const audioUrl = `https://api.meowpad.me/v2/sounds/preview/${
			sounds[0].id
		}.m4a`;

		await this.play(audioUrl);
	}

	async play(url)
	{
		const audio = new Audio(url);

		audio.addEventListener('canplaythrough', () => {
			audio.play();
		});

		await new Promise(resolve => {
			audio.addEventListener('ended', resolve);
		});
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

		const mount = (el, to, autoUnmount = true) => {
			find(to).append(el);

			BdApi.onRemoved(el, () => {
				if( this.launchedAt === currentLaunch )
					mount(el, to, false);
			});

			if( autoUnmount ){
				const beforeUnrender = this.unrender;
				this.unrender = () => {
					beforeUnrender();
					el.remove();
				};
			}
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

		channelBtn.addEventListener('click', () => {
			channelBtn.classList.toggle('on');

			if( channelBtn.classList.contains('on') )
				channelBtnImg.setAttribute('src', this.memeIcon);
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

	async start()
	{
		this.launchedAt = Date.now();

		this.dispatcher.subscribe('MESSAGE_CREATE', e => this.onMessage(e));

		BdApi.injectCSS('Memessages', `
			@import url("https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.3.0/css/all.min.css");

			.memessages--mute-toggle{
				position: relative;
				z-index: 2;
			}
			
			.memessages--mute-toggle i{
				transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
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

			.memessages--toolbar-btn img{
				position: absolute;
				bottom: 0;
				right: 0;
				width: 18px;
				height: 18px;
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
		this.launchedAt = 0;

		this.dispatcher.unsubscribe('MESSAGE_CREATE', e => this.onMessage(e));
		BdApi.clearCSS('Memessages');
		this.unrender();

		this.unrender = () => {};
	}

}