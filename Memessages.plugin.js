/**
 * @name Memessages
 * @author Greezor
 * @authorId 382062281623863298
 * @description Meme notifications
 * @version 0.3.2
 */

// окно с браузером звуков и/или подсказки autocomplete
// модификаторы в тексте типа [х2] (проиграть два раза или больше), также отступ и пагинация (может даже громкость/скорость/питч)
// избранные звуки (может типа мини саундпад или просто коллекция любимых)
// сочетания клавиш для отмены звуков, глушилки и избранного
// всплывашки что за звук играет
// резервный сервер myinstants
// прерывать звук если сообщение удалили/отредачили (сочетание для быстрого удаления)

module.exports = class Memessages {

	constructor(meta)
	{
		this.meta = meta;

		this.launchedAt = 0;
		this.lastMessageID = null;
		this.audios = [];
		this.sidebar = false;
		this.historyLength = 0;
		this.refs = {};

		this.unrender = () => {};
	}

	get pluginEnabled()
	{
		return !!this.launchedAt;
	}

	set pluginEnabled(value)
	{
		this.launchedAt = value ? Date.now() : 0;
	}

	get settings()
	{
		const defaultSettings = {
			memeChannels: [],
			muted: false,
			volume: 0.5,
			history: false,
			chaosMode: false,
		};

		return Object.assign({}, defaultSettings, (
			BdApi.Data.load(this.meta.name, 'settings') ?? {}
		));
	}

	set settings(value)
	{
		BdApi.Data.save(this.meta.name, 'settings', value);
	}

	get dispatcher()
	{
		return BdApi.Webpack.getModule(m => m.subscribe && m.unsubscribe);
	}

	get channelStore()
	{
		return BdApi.Webpack.getModule(m => m.getLastSelectedChannelId);
	}

	get isLangRU()
	{
		return (/ru/).test(navigator.language);
	}

	get $()
	{
		const currentLaunch = this.launchedAt;

		const el = (tag, attrs = {}) => {
			let elem = document.createElement(tag);

			for(let [ attr, value ] of Object.entries(attrs))
				elem.setAttribute(attr, value);

			return elem;
		};

		const find = (selector, parent = null) => (parent ?? document).querySelector(selector);

		const findAll = (selector, parent = null) => (parent ?? document).querySelectorAll(selector);

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

			BdApi.DOM.onRemoved(el, () => {
				if( this.launchedAt === currentLaunch )
					mount(el, selector, false);
			});

			if( firstMount )
				this.extendUnrender(() => el.remove());
		};

		const css = (el, styles = {}) => {
			for(let [ prop, value ] of Object.entries(styles))
				el.style.setProperty(prop, value);
		};

		return {
			el,
			find,
			findAll,
			mount,
			css,
		};
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
			!message.content
			||
			(
				!this.settings.chaosMode
				&&
				!this.settings.memeChannels.includes(channelId)
			)
		)	return;

		this.lastMessageID = message.id;

		const memeUrl = await this.getMemeSound(message.content);

		if( memeUrl )
			await this.play(memeUrl, {
				addToHistory: this.settings.history,
				props: {
					muted: this.settings.muted,
					volume: this.settings.volume,
					memessages: {
						message,
						channelId,
					},
				},
			});
	}

	async getMemeSound(text)
	{
		const json = await this.fetch({
			url: `https://api.meowpad.me/v2/sounds/search?q=${ encodeURIComponent(text) }`,
			headers: {
				'accept-language': 'ru,en',
			},
		});

		const { sounds } = JSON.parse(json);

		if( !sounds.length )
			return null;

		return `https://api.meowpad.me/v2/sounds/preview/${ sounds[0].id }.m4a`;
	}

	async play(url, params = {})
	{
		const audio = new Audio(url);

		if( params.props )
			for(let [ prop, value ] of Object.entries(params.props))
				audio[prop] = value;

		let historyCard = null;
		if( params.addToHistory ){
			audio.controls = true;
			
			let card = historyCard = this.$.el('div', { class: 'memessages--sidebar--card' });
			let labelWrapper = this.$.el('div');
			let label = this.$.el('span', { ['data-memessages-tooltip']: true });
			this.$.css(label, {
				'--text': `'${ this.isLangRU ? 'Копировать' : 'Copy' }'`,
				'--ws': 'nowrap',
				'cursor': 'pointer',
			});

			label.innerText = audio?.memessages?.message?.content ?? '';
			label.addEventListener('click', () => {
				DiscordNative.clipboard.copy(label.innerText);
				BdApi.UI.showToast(this.isLangRU ? 'Скопировано' : 'Copied', {
					type: 'info',
					timeout: 1000,
				});
			});

			labelWrapper.append(label);
			card.append(labelWrapper);
			this.refs.history.prepend(card);

			if( this.historyLength >= 500 )
				this.$.find('.memessages--sidebar--card:last-child', this.refs.history)
					.remove();
			else
				this.historyLength++;
		}

		this.audios.push(audio);

		audio.addEventListener('canplaythrough', () => {
			audio.play();
		}, { once: true });

		await new Promise(resolve => {
			audio.addEventListener('ended', resolve);
		});

		if( params.addToHistory ){
			audio.muted = false;
			audio.volume = 1;
			audio.currentTime = 0;
			historyCard.append(audio);
		}

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

		

		const muteBtnLabelMute = this.isLangRU ? 'Отключить звук' : 'Mute';
		const muteBtnLabelUnmute = this.isLangRU ? 'Включить звук' : 'Unmute';
		const muteBtn = this.$.el('div', {
			class: `${ this.$.find('[class^="winButtonMinMax"]').classList.value } memessages--mute-toggle on`,
			['data-memessages-tooltip']: true,
		});

		this.$.css(muteBtn, {
			'--text': `'${ muteBtnLabelMute }'`,
			'--offset': 'calc(-100% + 50px)',
			'--ws': 'nowrap',
		});

		const muteBtnIcon = this.$.el('i', { class: 'fa-solid fa-volume-off' });
		muteBtn.append(muteBtnIcon);

		const muteBtnImg = this.$.el('img', { src: this.memeIcon });
		muteBtn.append(muteBtnImg);

		if( this.settings.muted ){
			muteBtn.classList.remove('on');
			this.$.css(muteBtn, { '--text': `'${ muteBtnLabelUnmute }'` });
		}

		muteBtn.addEventListener('click', () => {
			this.settings = {
				...this.settings,
				muted: !this.settings.muted,
			};

			muteBtn.classList.toggle('on');

			this.aggregateAudio(audio => audio.muted = this.settings.muted);

			this.$.css(muteBtn, { '--text': `'${ muteBtnLabelUnmute }'` });

			if( !this.settings.muted ){
				muteBtnImg.setAttribute('src', this.memeIcon);
				this.$.css(muteBtn, { '--text': `'${ muteBtnLabelMute }'` });
			}
		});

		this.$.mount(muteBtn, '[class^="typeWindows"][class*="titleBar"]');



		const channelBtnLabelOn = this.isLangRU ? 'Включить мемы в канале' : 'Enable memes in a channel';
		const channelBtnLabelOff = this.isLangRU ? 'Выключить мемы в канале' : 'Disable memes in a channel';
		const channelBtn = this.$.el('div', {
			class: 'memessages--toolbar-btn memessages--channel-btn',
			['data-memessages-tooltip']: true,
		});

		this.$.css(channelBtn, {
			'--text': `'${ channelBtnLabelOn }'`,
			'--offset': 'calc(-100% + 30px)',
			'--ws': 'nowrap',
		});

		const channelBtnIconOn = this.$.el('i', { class: 'memessages--channel-btn--icon-on fa-solid fa-bell' });
		channelBtn.append(channelBtnIconOn);

		const channelBtnIconOff = this.$.el('i', { class: 'memessages--channel-btn--icon-off fa-solid fa-bell-slash' });
		channelBtn.append(channelBtnIconOff);

		const channelBtnImg = this.$.el('img', { src: this.memeIcon });
		channelBtn.append(channelBtnImg);

		const currentChannelId = this.channelStore.getChannelId();

		if( !currentChannelId )
			channelBtn.classList.add('hide');

		if( this.settings.memeChannels.includes(currentChannelId) ){
			channelBtn.classList.add('on');
			this.$.css(channelBtn, { '--text': `'${ channelBtnLabelOff }'` });
		}

		channelBtn.addEventListener('click', () => {
			channelBtn.classList.toggle('on');

			const channelId = this.channelStore.getChannelId();

			if( this.settings.memeChannels.includes(channelId) ){
				this.settings = {
					...this.settings,
					memeChannels: this.settings.memeChannels
						.filter(id => id != channelId),
				};

				this.$.css(channelBtn, { '--text': `'${ channelBtnLabelOn }'` });
			}else{
				this.settings = {
					...this.settings,
					memeChannels: [
						...this.settings.memeChannels,
						channelId,
					]
				};

				channelBtnImg.setAttribute('src', this.memeIcon);
				this.$.css(channelBtn, { '--text': `'${ channelBtnLabelOff }'` });
			}
		});

		const onChannelChange = ({ channelId }) => {
			if( this.launchedAt != currentLaunch ) return;

			if( channelId ){
				channelBtn.classList.remove('hide');

				if( this.settings.memeChannels.includes(channelId) ){
					channelBtn.classList.add('on');
					this.$.css(channelBtn, { '--text': `'${ channelBtnLabelOff }'` });
				}else{
					channelBtn.classList.remove('on');
					this.$.css(channelBtn, { '--text': `'${ channelBtnLabelOn }'` });
				}
			}
			else
				channelBtn.classList.add('hide');
		};

		this.dispatcher.subscribe('CHANNEL_SELECT', onChannelChange);
		this.extendUnrender(() => {
			this.dispatcher.unsubscribe('CHANNEL_SELECT', onChannelChange);
		});

		this.$.mount(channelBtn, '[class^="toolbar"]');



		const sidebarBtn = this.$.el('div', {
			class: 'memessages--toolbar-btn',
		});

		const sidebarBtnIcon = this.$.el('i', { class: 'fa-solid fa-bars' });
		sidebarBtn.append(sidebarBtnIcon);

		const sidebarBtnImg = this.$.el('img', { src: this.memeIcon });
		sidebarBtn.append(sidebarBtnImg);

		sidebarBtn.addEventListener('click', () => {
			this.sidebar = true;
			sidebar.classList.add('open');

			sidebarBtnImg.setAttribute('src', this.memeIcon);
		});

		this.$.mount(sidebarBtn, '[class^="toolbar"]');



		const sidebar = this.$.el('div', {
			class: 'memessages--sidebar',
		});

		const sidebarSettings = this.$.el('div', { class: 'memessages--sidebar--card sticky' });
		const sidebarCloseBtn = this.$.el('i', { class: 'memessages--sidebar--close fa-solid fa-angle-right' });
		const history = this.$.el('div', { class: 'memessages--sidebar--history' });
		this.refs.history = history;
		sidebarSettings.append(sidebarCloseBtn);
		sidebar.append(sidebarSettings);
		sidebar.append(history);

		sidebarCloseBtn.addEventListener('click', () => {
			this.sidebar = false;
			sidebar.classList.remove('open');
		});

		sidebar.addEventListener('scroll', () => {
			if( sidebar.scrollTop > 20 )
				sidebarSettings.classList.add('shadow');
			else
				sidebarSettings.classList.remove('shadow');
		});

		const settingsList = [
			{
				type: 'slider',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/57562.m4a',
					'https://api.meowpad.me/v2/sounds/preview/48886.m4a',
					'https://api.meowpad.me/v2/sounds/preview/37525.m4a',
					'https://api.meowpad.me/v2/sounds/preview/60843.m4a',
					'https://api.meowpad.me/v2/sounds/preview/39479.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1475.m4a',
					'https://api.meowpad.me/v2/sounds/preview/3145.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1125.m4a',
					'https://api.meowpad.me/v2/sounds/preview/29.m4a',
					'https://api.meowpad.me/v2/sounds/preview/46609.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1216.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1826.m4a',
					'https://api.meowpad.me/v2/sounds/preview/39096.m4a',
					'https://api.meowpad.me/v2/sounds/preview/10190.m4a',
					'https://api.meowpad.me/v2/sounds/preview/54023.m4a',
					'https://api.meowpad.me/v2/sounds/preview/55193.m4a',
					'https://api.meowpad.me/v2/sounds/preview/41776.m4a',
				],
				prop: 'volume',
				label: this.isLangRU ? 'Громкость' : 'Volume',
			},
			{
				type: 'toggle',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/31297.m4a',
					'https://api.meowpad.me/v2/sounds/preview/4898.m4a',
					'https://api.meowpad.me/v2/sounds/preview/8761.m4a',
				],
				prop: 'history',
				label: this.isLangRU ? 'Отображать историю звуков' : 'Show sound history',
				action: () => {
					history.innerHTML = '';
				},
			},
			{
				type: 'toggle',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/78899.m4a',
					'https://api.meowpad.me/v2/sounds/preview/78898.m4a',
				],
				prop: 'chaosMode',
				label: this.isLangRU ? 'Режим Хаоса!' : 'Chaos Mode!',
			},
		];

		for(let setting of settingsList){
			const group = this.$.el('div', { class: 'memessages--sidebar--setting' });
			const label = this.$.el('span');
			label.innerText = setting.label;
			group.append(label);
			sidebarSettings.append(group);

			const getRandomSound = () => (setting?.sounds ?? [])?.[
				Math.floor(Math.random() * (setting?.sounds?.length ?? 0))
			];

			switch(setting.type){
				case 'toggle':
					const toggle = this.$.el('div', { class: 'memessages--toggle' });
					group.append(toggle);

					if( this.settings[setting.prop] )
						toggle.classList.add('on');

					toggle.addEventListener('click', async () => {
						toggle.classList.toggle('on');

						this.settings = {
							...this.settings,
							[setting.prop]: !this.settings[setting.prop],
						};

						const sound = getRandomSound();
						if( sound && this.settings[setting.prop] )
							await this.play(sound);

						setting?.action?.(this.settings[setting.prop]);
					});
					break;

				case 'slider':
					const slider = this.$.el('div', { class: 'memessages--slider' });
					group.append(slider);

					let value = this.settings[setting.prop];
					this.$.css(slider, { '--value': value });

					let enabled = false;
					const onChange = e => {
						if( !enabled ) return;

						requestAnimationFrame(async () => {
							const bounds = slider.getBoundingClientRect();

							let newValue = Math.max(0, (
								Math.min(1, (
									(e.clientX - bounds.x) / bounds.width
								))
							));

							this.$.css(slider, { '--value': newValue });

							this.aggregateAudio(audio => audio.volume = newValue);

							this.settings = {
								...this.settings,
								[setting.prop]: newValue,
							};
						});
					};

					slider.addEventListener('mousedown', e => {
						enabled = true;
						onChange(e);
					});

					document.addEventListener('mousemove', onChange);

					document.addEventListener('mouseup', async e => {
						if( !enabled ) return;
						
						enabled = false;

						const sound = getRandomSound();
						if( sound && this.settings[setting.prop] != value )
							await this.play(sound, {
								props: {
									volume: this.settings[setting.prop],
								},
							});

						value = this.settings[setting.prop];

						setting?.action?.(this.settings[setting.prop]);
					});
					break;
			}
		}

		this.$.mount(sidebar, '[class^="app-"]');
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

		BdApi.DOM.addStyle(this.meta.name, `
			@import url("https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.3.0/css/all.min.css");

			[data-memessages-tooltip]{
				position: relative;
				--text: '';
				--width: auto;
				--offset: 0px;
				--ws: normal;
			}

			[data-memessages-tooltip]:after{
				content: var(--text);
				position: absolute;
				padding: 10px;
				margin-top: -10px;
				top: calc(100% + 10px);
				left: 0;
				width: var(--width);
				transform: translateX(var(--offset));
				background: #fff;
				border-radius: 10px;
				font-size: 14px;
				line-height: 130%;
				white-space: var(--ws);
				color: #333;
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				pointer-events: none;
				transition: all 0.2s ease;
				opacity: 0;
				z-index: 999;
			}

			[data-memessages-tooltip]:hover:after{
				margin-top: 0px;
				opacity: 1;
			}

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

			.memessages--sidebar{
				position: absolute;
				padding: 10px;
				top: 0;
				right: 0;
				bottom: 0;
				width: 360px;
				background: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.6) 100%);
				transform: translateX(100%);
				transition: all 0.3s ease;
				overflow-x: hidden;
				overflow-y: auto;
				box-sizing: border-box;
				z-index: 99999;
			}

			.memessages--sidebar::-webkit-scrollbar{
				width: 5px;
			}

			.memessages--sidebar::-webkit-scrollbar-track{
				background: #000;
			}

			.memessages--sidebar::-webkit-scrollbar-thumb{
				background: #5865f2;
				border-radius: 100px;
			}

			.memessages--sidebar.open{
				transform: none;
			}

			.memessages--sidebar--card{
				display: flex;
				flex-direction: column;
				margin-bottom: 20px;
				padding: 20px;
				gap: 20px;
				background: #fff;
				border-radius: 10px;
				font-size: 18px;
				line-height: 130%;
				color: #333;
				box-sizing: border-box;
				transition: all 0.3s ease;
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							0 0 0 0 rgba(0, 0, 0, 0.3);
			}

			.memessages--sidebar--card.sticky{
				position: sticky;
				padding-left: 17px;
				top: 0px;
				border-left: 3px solid #5865f2;
				z-index: 99999;
			}

			.memessages--sidebar--card.shadow{
				box-shadow: inset 0 0 0 0 rgba(0, 0, 0, 0.1),
							0 2px 5px 1px rgba(0, 0, 0, 0.3);
			}

			.memessages--sidebar--card > img,
			.memessages--sidebar--card > audio{
				width: 100%;
			}

			.memessages--sidebar--close{
				position: fixed;
				top: 50%;
				right: 370px;
				margin-top: -25px;
				display: flex;
				justify-content: center;
				align-items: center;
				width: 50px;
				height: 50px;
				background: #fff;
				border-radius: 50%;
				font-size: 25px;
				color: #333;
				transition: all 0.2s ease 0.3s,
							background 0.2s ease,
							color 0.2s ease;
				transform: scale(0);
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				cursor: pointer;
			}

			.memessages--sidebar--close:hover{
				background: #5865f2;
				color: #fff;
			}

			.memessages--sidebar.open .memessages--sidebar--close{
				transform: scale(1);
			}

			.memessages--sidebar--history{
				display: flex;
				flex-direction: column;
				word-break: break-all;
				user-select: text;
			}

			.memessages--sidebar--setting{
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 20px;
			}

			.memessages--toggle{
				position: relative;
				display: inline-block;
				width: 40px;
				height: 25px;
				background: #555;
				border-radius: 100px;
				transition: all 0.3s ease;
				cursor: pointer;
			}

			.memessages--toggle:after{
				content: '';
				position: absolute;
				top: 2px;
				left: 2px;
				width: 21px;
				height: 21px;
				background: #fff;
				border-radius: 50%;
				transition: inherit;
			}

			.memessages--toggle.on{
				background: #5865f2;
			}

			.memessages--toggle.on:after{
				transform: translateX(15px);
			}

			.memessages--slider{
				position: relative;
				margin: 0 8px;
				width: 100%;
				height: 10px;
				background: #555;
				border-radius: 100px;
				--value: 0;
			}

			.memessages--slider:before{
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				width: calc(var(--value) * 100%);
				height: 100%;
				background: #5865f2;
				border-radius: 100px;
			}

			.memessages--slider:after{
				content: '';
				position: absolute;
				top: 50%;
				left: calc(var(--value) * 100%);
				width: 16px;
				height: 16px;
				margin-top: -8px;
				margin-left: -8px;
				background: #fff;
				border-radius: 50%;
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				cursor: grab;
			}

			.memessages--slider:active,
			.memessages--slider:active:after{
				cursor: grabbing;
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
		BdApi.DOM.removeStyle(this.meta.name);
		this.unrender();

		this.unrender = () => {};
	}

}