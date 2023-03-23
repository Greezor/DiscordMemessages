/**
 * @name Memessages
 * @author Greezor
 * @authorId 382062281623863298
 * @description Plays sound memes when receiving messages
 * @version 0.8.0
 * @donate https://boosty.to/greezor
 * @source https://github.com/Greezor/DiscordMemessages
 */

module.exports = class Memessages {

	constructor(meta)
	{
		this.meta = meta;

		this.launchedAt = 0;
		this.lastMessageID = null;
		this.audioQueue = new Set();
		this.sidebar = false;
		this.historyLength = 0;
		this.refs = {};

		this._settings = null;

		this.unrender = () => {};

		this.getMemeIcon = this.createShuffleCycle(
			this.memeIcons
		);
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
		if( this._settings )
			return this._settings;

		const defaultSettings = {
			memeChannels: [],
			muted: false,
			volume: 0.5,
			history: false,
			historyLimit: 100,
			soundsLimit: 100,
			chaosMode: false,
		};

		return this._settings = Object.assign({}, defaultSettings, (
			BdApi.Data.load(this.meta.name, 'settings') ?? {}
		));
	}

	set settings(value)
	{
		this._settings = value;
		BdApi.Data.save(this.meta.name, 'settings', value);
	}

	get React()
	{
		return BdApi.Webpack.getModule(m => m.createElement && m.cloneElement);
	}

	get dispatcher()
	{
		return BdApi.Webpack.getModule(m => m.dispatch && m.subscribe);
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
			if( !el ) return;

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
			if( !el ) return;

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

	shuffle(arr)
	{
		let array = [ ...arr ];

		for(let i = array.length - 1; i > 0; i--){
			let j = Math.floor(Math.random() * (i + 1));
			[ array[i], array[j] ] = [ array[j], array[i] ];
		}

		return array;
	}

	createShuffleCycle(array)
	{
		let shuffled = [];
		let index = 0;

		return () => {
			if( shuffled[index] )
				return shuffled[index++];

			index = 1;
			shuffled = this.shuffle(array);
			return shuffled[0];
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

	get memeIcons()
	{
		return [
			'https://img.icons8.com/fluency/96/null/doge.png',
			'https://img.icons8.com/color/96/null/not-bad-meme.png',
			'https://img.icons8.com/officel/80/null/scared-face-meme.png',
			'https://img.icons8.com/fluency/96/null/trollface.png',
			'https://img.icons8.com/color/96/null/feels-guy.png',
			'https://img.icons8.com/fluency/96/null/lul.png',
			'https://img.icons8.com/fluency/96/null/monkas.png',
			'https://img.icons8.com/fluency/96/null/pogchamp.png',
			'https://img.icons8.com/fluency/96/null/gachi.png',
			'https://img.icons8.com/fluency/96/null/angry-face-meme.png',
			'https://img.icons8.com/color-glass/96/null/salt-bae.png',
			'https://img.icons8.com/color/96/null/ugandan-knuckles.png',
		];
	}

	get memeIcon()
	{
		return this.getMemeIcon();
	}

	async onMessage({ message, optimistic })
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
				!this.settings.memeChannels.includes(message.channel_id)
			)
		)	return;

		this.lastMessageID = message.id;

		const modificators = this.getModificators(message.content);
		const memeUrl = await this.getMemeSound(message.content, modificators);

		if( memeUrl )
			this.createAudio(memeUrl, message, modificators);
	}

	onMessageDelete({ id })
	{
		if( !this.pluginEnabled ) return;

		this.aggregateAudio(audio => {
			if( audio?.memessage?.id === id ){
				audio.dispatchEvent( new Event('ended') );
			}
		});
	}

	onMessageEdit({ message })
	{
		if( !this.pluginEnabled || !message ) return;

		this.onMessageDelete(message);

		this.lastMessageID = null;

		this.onMessage({ message });
	}

	getModificators(text)
	{
		let modificators = {
			x: 1,
			rate: 1,
			pitch: false,
			soundIndex: 0,
			important: false,
			lang: null,
		};

		const rules = [
			[
				/^x(\d+)$/,
				(match, $1) => modificators.x = Math.min(100, Number($1)),
			],
			[
				/^>>(\d+)$/,
				(match, $1) => modificators.rate = Number($1) / 100,
			],
			[
				/^#$/,
				() => modificators.pitch = true,
			],
			[
				/^(\d+)$/,
				(match, $1) => modificators.soundIndex = Number($1),
			],
			[
				/^!$/,
				() => modificators.important = true,
			],
			[
				/^(ru|en)$/,
				(match, $1) => modificators.lang = $1,
			],

			// dev
			[
				/^log$/,
				() => console.log(this),
			],
		];

		for(let [ match, $1 ] of text.matchAll(/\[([^\]]+)\]/gm)){
			for(let [ reg, apply ] of rules){
				const result = $1.match(reg);

				if( result )
					apply(...result);
			}
		}

		return modificators;
	}

	async getMemeSound(text, modificators = {})
	{
		text = text
			.replace(/\[([^\]]+)\]/gm, '')
			.replace(
				/(https?:\/\/tenor\.com\/view\/)([^\s]+)/gim,
				(match, $1, $2) => decodeURIComponent(
					$2
						.replace(/(-gif-|-)/gim, ' ')
						.replace(/\d+$/gim, '')
						.trim()
				)
			)
			.replace(/\s+\s/gm, ' ')
			.trim();

		if( !text )
			return null;

		const json = await this.fetch({
			url: `https://api.meowpad.me/v2/sounds/search?q=${ encodeURIComponent(text) }`,
			headers: {
				'accept-language': modificators.lang ?? 'ru,en',
			},
		});

		const { sounds } = JSON.parse(json);

		if( !sounds.length )
			return null;

		const index = modificators.soundIndex ?? 0;
		const sound = sounds?.[index] ?? sounds[sounds.length - 1];

		return `https://api.meowpad.me/v2/sounds/preview/${ sound.id }.m4a`;
	}

	audioQueuePush(audio, force = false, warn = true)
	{
		if( this.audioQueue.has(audio) )
			return true;

		if( !force && this.audioQueue.size >= this.settings.soundsLimit ){
			if( warn )
				BdApi.UI.showToast(this.isLangRU ? 'Слишком много звуков!!!' : 'Too many sounds!!!', {
					type: 'danger',
					timeout: 3000,
				});

			return false;
		}

		this.audioQueue.add(audio);

		return true;
	}

	async createAudio(url, message = null, modificators = {}, addToHistory = true, autoplay = true)
	{
		const audio = new Audio(url);

		audio.memessage = message;

		audio.muted = this.settings.muted;
		audio.volume = this.settings.volume;

		audio.playbackRate = modificators.rate ?? 1;
		audio.preservesPitch = !(modificators.pitch ?? false);

		await new Promise(resolve => {
			audio.addEventListener('canplaythrough', resolve, { once: true });

			if( audio.readyState > 3 )
				resolve();
		});

		if(
			!this.pluginEnabled
			||
			(
				autoplay
				&&
				!this.audioQueuePush(audio, !!modificators.important)
			)
		)	return null;

		let subAudios = [];
		for(let i = 1; i < (modificators.x ?? 1); i++)
			subAudios.push(
				await this.createAudio(
					url,
					message,
					{
						...modificators,
						x: 1,
						important: false,
					},
					false,
					false,
				)
			);

		let localRefs = {};
		if( addToHistory && this.settings.history && message ){
			let card = this.$.el('div', { class: 'memessages--sidebar--card' });
			let labelWrapper = this.$.el('div');
			let label = this.$.el('span', { ['data-memessages-tooltip']: true });
			this.$.css(label, {
				'--text': `'${ this.isLangRU ? 'Копировать' : 'Copy' }'`,
				'--ws': 'nowrap',
				'cursor': 'pointer',
			});

			label.innerText = message?.content ?? '';
			label.addEventListener('click', () => {
				DiscordNative.clipboard.copy(label.innerText);
				BdApi.UI.showToast(this.isLangRU ? 'Скопировано' : 'Copied', {
					type: 'info',
					timeout: 1000,
				});
			});

			labelWrapper.append(label);
			card.append(labelWrapper);

			const player = this.$.el('div', { class: 'memessages--player' });
			const playBtn = this.$.el('i', { class: 'fa-solid fa-play' });
			const progressBar = this.$.el('div', { class: 'memessages--slider progress' });
			const meowpadBtn = this.$.el('a', { href: `https://meowpad.me/sound/${ audio.src.match(/(\d+)\.m4a$/)[1] }`, target: '_blank', ['data-memessages-tooltip']: true });
			const mewopadIcon = this.$.el('i', { class: 'fa-solid fa-arrow-up-right-from-square' });
			const downloadBtn = this.$.el('a', { href: audio.src, target: '_blank', download: true, ['data-memessages-tooltip']: true });
			const downloadIcon = this.$.el('i', { class: 'fa-solid fa-download' });

			this.$.css(meowpadBtn, {
				'--text': `'Meowpad'`,
				'--offset': 'calc(-50% + 9px)',
				'--ws': 'nowrap',
			});

			this.$.css(downloadBtn, {
				'--text': `'${ this.isLangRU ? 'Загрузить' : 'Download' }'`,
				'--offset': 'calc(-100% + 18px)',
				'--ws': 'nowrap',
			});
			
			meowpadBtn.append(mewopadIcon);
			downloadBtn.append(downloadIcon);
			player.append(playBtn);
			player.append(progressBar);
			player.append(meowpadBtn);
			player.append(downloadBtn);
			card.append(player);

			playBtn.addEventListener('click', () => {
				if( this.audioQueue.has(audio) )
					audio.dispatchEvent( new Event('ended') );
				else
					audio.play();
			});

			this.$.css(progressBar, {
				'pointer-events': 'none',
			});

			// let enabled = false;
			// const onChange = e => {
			// 	if( !enabled ) return;

			// 	requestAnimationFrame(async () => {
			// 		const bounds = progressBar.getBoundingClientRect();

			// 		let value = Math.max(0, (
			// 			Math.min(1, (
			// 				(e.clientX - bounds.x) / bounds.width
			// 			))
			// 		));

			// 		audio.currentTime = Math.round(value * audio.duration);

			// 		for(let subAudio of subAudios)
			// 			subAudio.currentTime = audio.currentTime;
			// 	});
			// };

			// progressBar.addEventListener('mousedown', e => {
			// 	enabled = true;
			// 	onChange(e);
			// });

			// document.addEventListener('mousemove', onChange);

			// document.addEventListener('mouseup', e => {
			// 	enabled = false;
			// });

			audio.addEventListener('timeupdate', () => {
				if( !audio.paused )
					this.$.css(progressBar, {
						'--value': audio.currentTime / audio.duration,
					});
			});

			localRefs = {
				card,
				player,
				playBtn,
				progressBar,
			};
		}

		audio.addEventListener('playing', () => {
			audio.muted = this.settings.muted;
			audio.volume = this.settings.volume;

			if( !this.audioQueuePush(audio) )
				return audio.dispatchEvent( new Event('ended') );

			for(let subAudio of subAudios)
				subAudio.play();

			localRefs?.playBtn?.classList?.add?.('fa-stop');
			localRefs?.playBtn?.classList?.remove?.('fa-play');

			this.$.css(localRefs?.progressBar, { '--value': 0 });
		});

		audio.addEventListener('ended', () => {
			audio.pause();
			audio.currentTime = 0;

			this.audioQueue.delete(audio);

			for(let subAudio of subAudios)
				subAudio.dispatchEvent( new Event('ended') );

			localRefs?.playBtn?.classList?.add?.('fa-play');
			localRefs?.playBtn?.classList?.remove?.('fa-stop');

			this.$.css(localRefs?.progressBar, { '--value': 0 });
		});

		if( modificators.important )
			this.aggregateAudio(a => {
				if( a !== audio )
					a.dispatchEvent( new Event('ended') );
			});

		if( autoplay )
			audio.play();

		if( localRefs.card ){
			this.refs.history.prepend(localRefs.card);

			if( this.historyLength >= this.settings.historyLimit )
				this.$.find('.memessages--sidebar--card:last-child', this.refs.history)
					.remove();
			else
				this.historyLength++;
		}

		return audio;
	}

	async aggregateAudio(func)
	{
		for(let audio of this.audioQueue)
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

				this.aggregateAudio(audio => {
					if( audio?.memessage?.channel_id == channelId )
						audio.dispatchEvent( new Event('ended') );
				});
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



		const sidebar = this.$.el('div', { class: 'memessages--sidebar' });
		const sidebarScrollbox = this.$.el('div', { class: 'memessages--sidebar--scrollbox' });
		const sidebarSettings = this.$.el('div', { class: 'memessages--sidebar--card sticky' });
		const sidebarCloseBtn = this.$.el('i', { class: 'memessages--sidebar--close fa-solid fa-angle-right' });
		const history = this.$.el('div', { class: 'memessages--sidebar--history' });
		this.refs.history = history;
		sidebarScrollbox.append(sidebarSettings);
		sidebarScrollbox.append(history);
		sidebar.append(sidebarScrollbox);
		sidebar.append(sidebarCloseBtn);

		sidebarCloseBtn.addEventListener('click', () => {
			this.sidebar = false;
			sidebar.classList.remove('open');
		});

		sidebarScrollbox.addEventListener('scroll', () => {
			if( sidebarScrollbox.scrollTop > 20 )
				sidebarSettings.classList.add('shadow');
			else
				sidebarSettings.classList.remove('shadow');
		});

		const settingsList = [
			{
				type: 'slider',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/57562.m4a',
					'https://api.meowpad.me/v2/sounds/preview/37525.m4a',
					'https://api.meowpad.me/v2/sounds/preview/60843.m4a',
					'https://api.meowpad.me/v2/sounds/preview/39479.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1475.m4a',
					'https://api.meowpad.me/v2/sounds/preview/3145.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1125.m4a',
					'https://api.meowpad.me/v2/sounds/preview/29.m4a',
					'https://api.meowpad.me/v2/sounds/preview/46609.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1826.m4a',
					'https://api.meowpad.me/v2/sounds/preview/39096.m4a',
					'https://api.meowpad.me/v2/sounds/preview/10190.m4a',
					'https://api.meowpad.me/v2/sounds/preview/54023.m4a',
					'https://api.meowpad.me/v2/sounds/preview/55193.m4a',
					'https://api.meowpad.me/v2/sounds/preview/41776.m4a',
					'https://www.myinstants.com/media/sounds/devil-may-cry-menu-sound.mp3',
					'https://www.myinstants.com/media/sounds/eh-put0-marty-mcfly.mp3',
				],
				prop: 'volume',
				label: this.isLangRU ? 'Громкость' : 'Volume',
			},
			{
				type: 'toggle',
				sounds: [
					...(
						this.isLangRU
							? [
								'https://api.meowpad.me/v2/sounds/preview/31297.m4a',
								'https://api.meowpad.me/v2/sounds/preview/4898.m4a',
								'https://api.meowpad.me/v2/sounds/preview/8761.m4a',
							]
							: []
					),
					'https://api.meowpad.me/v2/sounds/preview/24702.m4a',
					'https://api.meowpad.me/v2/sounds/preview/3435.m4a',
					'https://api.meowpad.me/v2/sounds/preview/2472.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1688.m4a',
					'https://www.myinstants.com/media/sounds/back-to-the-future-1.mp3',
				],
				prop: 'history',
				label: this.isLangRU ? 'Отображать историю звуков' : 'Show sound history',
				action: () => {
					history.innerHTML = '';
					this.historyLength = 0;
				},
			},
			{
				type: 'toggle',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/78899.m4a',
					'https://api.meowpad.me/v2/sounds/preview/78898.m4a',
					'https://api.meowpad.me/v2/sounds/preview/963.m4a',
					'https://api.meowpad.me/v2/sounds/preview/7486.m4a',
					'https://api.meowpad.me/v2/sounds/preview/25300.m4a',
					'https://api.meowpad.me/v2/sounds/preview/74341.m4a',
					'https://api.meowpad.me/v2/sounds/preview/641.m4a',
					'https://api.meowpad.me/v2/sounds/preview/62105.m4a',
					'https://api.meowpad.me/v2/sounds/preview/974.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1216.m4a',
					'https://api.meowpad.me/v2/sounds/preview/48886.m4a',
					'https://www.myinstants.com/media/sounds/00002a5b.mp3',
				],
				prop: 'chaosMode',
				label: this.isLangRU ? 'Режим Хаоса!' : 'Chaos Mode!',
			},
			{
				type: 'input',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/79117.m4a',
				],
				prop: 'historyLimit',
				label: this.isLangRU ? 'Лимит истории' : 'History limit',
				options: {
					min: '1',
					type: 'number',
					style: 'width: 50px; text-align: center;',
				},
				action: value => {
					this.settings.historyLimit = Math.max(1, Number(value));
				},
			},
			{
				type: 'input',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/79117.m4a',
				],
				prop: 'soundsLimit',
				label: this.isLangRU ? 'Лимит звуков' : 'Sounds limit',
				options: {
					min: '1',
					type: 'number',
					style: 'width: 50px; text-align: center;',
				},
				action: value => {
					this.settings.soundsLimit = Math.max(1, Number(value));
				},
			},
			{
				type: 'button',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/38297.m4a',
				],
				label: this.isLangRU ? 'О плагине' : 'About',
				action: () => {
					const h = this.React.createElement;
					BdApi.UI.showConfirmationModal(`${ this.meta.name } ${ this.meta.version }`, (
						this.isLangRU
							? h('div', { class: 'memessages--modal' },
								h('p', null, 'Спасибо за установку плагина =)'),
								h('p', null,
									h('span', null, 'Если вам понравился плагин, вы можете поддержать меня тут: '),
									h('a', { href: 'https://boosty.to/greezor', target: '_blank' }, 'Boosty'),
								),
								h('br'),
								h('p', null,
									h('sub', null,
										h('span', null, 'Звуки: '),
										h('a', { href: 'https://meowpad.me/', target: '_blank' }, 'Meowpad'),
									),
									h('br'),
									h('sub', null,
										h('span', null, 'Иконки: '),
										h('a', { href: 'https://fontawesome.com/', target: '_blank' }, 'Font Awesome'),
										h('span', null, ', '),
										h('a', { href: 'https://icons8.com/', target: '_blank' }, 'Icons8'),
									),
								),
							)
							: h('div', { class: 'memessages--modal' },
								h('p', null, 'Thank you for installing the plugin =)'),
								h('p', null,
									h('span', null, 'If you like the plugin, you can support me here: '),
									h('a', { href: 'https://boosty.to/greezor', target: '_blank' }, 'Boosty'),
								),
								h('br'),
								h('p', null,
									h('sub', null,
										h('span', null, 'Sounds: '),
										h('a', { href: 'https://meowpad.me/', target: '_blank' }, 'Meowpad'),
									),
									h('br'),
									h('sub', null,
										h('span', null, 'Icons: '),
										h('a', { href: 'https://fontawesome.com/', target: '_blank' }, 'Font Awesome'),
										h('span', null, ', '),
										h('a', { href: 'https://icons8.com/', target: '_blank' }, 'Icons8'),
									),
								),
							)
					), {
						confirmText: 'OK',
						cancelText: this.isLangRU ? 'Проверить обновления' : 'Check for updates',
						onCancel: () => {
							BdApi.UI.showToast(this.isLangRU ? 'Поиск обновлений...' : 'Search for updates...', {
								type: 'info',
								timeout: 3000,
							});

							setTimeout(async () => {
								await this.autoUpdate();

								BdApi.UI.showToast(this.isLangRU ? 'Установлена последняя версия' : 'Latest version installed', {
									type: 'success',
									timeout: 3000,
								});
							}, 1000);
						},
					});
				},
			},
		];

		for(let setting of settingsList){
			const group = this.$.el('div', { class: 'memessages--sidebar--setting' });
			const label = this.$.el('span');
			label.innerText = setting.label;
			group.append(label);
			sidebarSettings.append(group);

			const getRandomSound = this.createShuffleCycle(
				setting?.sounds ?? []
			);

			switch(setting.type){
				case 'toggle':
					const toggle = this.$.el('div', { class: 'memessages--toggle' });
					group.append(toggle);

					if( this.settings[setting.prop] )
						toggle.classList.add('on');

					toggle.addEventListener('click', () => {
						toggle.classList.toggle('on');

						this.settings = {
							...this.settings,
							[setting.prop]: !this.settings[setting.prop],
						};

						setting?.action?.(this.settings[setting.prop]);

						if( this.settings[setting.prop] ){
							const sound = getRandomSound();
							
							if( sound )
								this.createAudio(sound);
						}
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

					document.addEventListener('mouseup', e => {
						if( !enabled ) return;
						
						enabled = false;

						setting?.action?.(this.settings[setting.prop]);

						if( this.settings[setting.prop] != value ){
							const sound = getRandomSound();
							
							if( sound )
								this.createAudio(sound);
						}

						value = this.settings[setting.prop];
					});
					break;
				
				case 'button':
					group.classList.add('clickable');
					group.addEventListener('click', () => {
						setting?.action?.(this.settings[setting.prop]);

						const sound = getRandomSound();

						if( sound )
							this.createAudio(sound);
					});
					break;

				case 'input':
					const input = this.$.el('input', { class: 'memessages--input', type: 'text' });
					group.append(input);

					for(let [ attr, value ] of Object.entries(setting?.options ?? {}))
						input.setAttribute(attr, value);

					input.value = this.settings[setting.prop];

					input.addEventListener('keypress', e => e.stopPropagation());
					input.addEventListener('keydown', e => e.stopPropagation());
					input.addEventListener('keyup', e => e.stopPropagation());

					input.addEventListener('input', e => {
						e.stopPropagation();

						this.settings = {
							...this.settings,
							[setting.prop]: input.value,
						};

						setting?.action?.(this.settings[setting.prop]);

						input.value = this.settings[setting.prop];

						if( this.settings[setting.prop] ){
							const sound = getRandomSound();
							
							if( sound )
								this.createAudio(sound);
						}
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
	
	async autoUpdate()
	{
		const code = await this.fetch('https://raw.githubusercontent.com/Greezor/DiscordMemessages/master/Memessages.plugin.js');

		const [ , newMajor, newMinor, newPatch ] = code.match(/@version (\d)\.(\d)\.(\d)/);
		const [ major, minor, patch ] = this.meta.version.split('.');

		if(
			Number(newMajor) > Number(major)
			||
			(
				Number(newMajor) == Number(major)
				&&
				Number(newMinor) > Number(minor)
			)
			||
			(
				Number(newMajor) == Number(major)
				&&
				Number(newMinor) == Number(minor)
				&&
				Number(newPatch) > Number(patch)
			)
		){
			require('fs').writeFile(
				require('path').join(__dirname, this.meta.filename),
				code,
				() => BdApi.UI.showNotice(this.isLangRU ? `Плагин "Memessages" обновлён до версии ${ newMajor }.${ newMinor }.${ newPatch }` : `Plugin "Memessages" updated to version ${ newMajor }.${ newMinor }.${ newPatch }`, {
					type: 'success',
					timeout: 0,
				})
			)
		}
	}

	async start()
	{
		this.pluginEnabled = true;

		this.dispatcher.subscribe('MESSAGE_CREATE', e => this.onMessage(e));
		this.dispatcher.subscribe('MESSAGE_DELETE', e => this.onMessageDelete(e));
		this.dispatcher.subscribe('MESSAGE_UPDATE', e => this.onMessageEdit(e));

		BdApi.DOM.addStyle(this.meta.name, `
			@import url("https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.3.0/css/all.min.css");

			:root{
				--mm-color--black: #000000;
				--mm-color--white: #fafafa;
				--mm-color--dark-gray: #1e1f22;
				--mm-color--light-gray: #e3e5e8;
				--mm-color--gray: #313338;
				--mm-color--discord: #5865ed;
			}

			html.theme-dark{
				--mm--bg: var(--mm-color--gray);
				--mm--bg-second: var(--mm-color--dark-gray);
				--mm--bg-negative: var(--mm-color--white);
				--mm--accent: var(--mm-color--discord);
				--mm--text: var(--mm-color--white);
				--mm--text-negative: var(--mm-color--gray);
			}

			html.theme-light{
				--mm--bg: var(--mm-color--white);
				--mm--bg-second: var(--mm-color--light-gray);
				--mm--bg-negative: var(--mm-color--gray);
				--mm--accent: var(--mm-color--discord);
				--mm--text: var(--mm-color--gray);
				--mm--text-negative: var(--mm-color--white);
			}

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
				background: var(--mm--bg);
				border-radius: 5px;
				font-size: 14px;
				line-height: 130%;
				white-space: var(--ws);
				color: var(--mm--text);
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				pointer-events: none;
				transition: all 0.2s ease;
				opacity: 0;
				z-index: 9999;
			}

			[data-memessages-tooltip]:hover:after{
				margin-top: 0px;
				opacity: 1;
			}

			.memessages--mute-toggle{
				position: relative;
				z-index: 9999;
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
				pointer-events: none;
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

			.memessages--channel-btn img{
				pointer-events: none;
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
				top: 0;
				right: 0;
				bottom: 0;
				width: 500px;
				background: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.5) 100%);
				background-repeat: no-repeat;
				background-position: 500px 0;
				transform: translateX(100%);
				transition: all 0.3s ease,
							background-position 0.3s ease 0.15s;
				visibility: hidden;
				pointer-events: none;
				z-index: 999;
			}

			.memessages--sidebar--scrollbox{
				position: absolute;
				padding: 10px;
				top: 0;
				right: 0;
				width: 360px;
				max-height: 100%;
				overflow-x: hidden;
				overflow-y: auto;
				box-sizing: border-box;
				pointer-events: auto;
			}

			.memessages--sidebar--scrollbox::-webkit-scrollbar{
				width: 5px;
			}

			.memessages--sidebar--scrollbox::-webkit-scrollbar-track{
				background: var(--mm-color--black);
			}

			.memessages--sidebar--scrollbox::-webkit-scrollbar-thumb{
				background: var(--mm--accent);
				border-radius: 100px;
			}

			.memessages--sidebar.open{
				transform: none;
				visibility: visible;
				background-position: 0 0;
			}

			.memessages--sidebar--card{
				display: flex;
				flex-direction: column;
				margin-bottom: 20px;
				padding: 20px;
				gap: 20px;
				background: var(--mm--bg);
				border-radius: 5px;
				font-size: 18px;
				line-height: 130%;
				color: var(--mm--text);
				box-sizing: border-box;
				transition: all 0.3s ease;
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 0 0 0 -100px var(--mm--accent),
							0 0 0 0 rgba(0, 0, 0, 0.3);
			}

			.memessages--sidebar--card.sticky{
				position: sticky;
				top: 0px;
				z-index: 999;
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 103px 0 0 -100px var(--mm--accent),
							0 0 0 0 rgba(0, 0, 0, 0.3);
			}

			.memessages--sidebar--card.shadow{
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 0 0 0 -100px var(--mm--accent),
							0 2px 5px 1px rgba(0, 0, 0, 0.3);
			}

			.memessages--sidebar--card.sticky.shadow{
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 103px 0 0 -100px var(--mm--accent),
							0 2px 5px 1px rgba(0, 0, 0, 0.3);
			}

			.memessages--sidebar--card > img,
			.memessages--sidebar--card > audio{
				width: 100%;
			}

			.memessages--sidebar--close{
				position: absolute;
				top: 15px;
				right: 370px;
				display: flex;
				justify-content: center;
				align-items: center;
				width: 50px;
				height: 50px;
				background: var(--mm-color--white);
				border-radius: 50%;
				font-size: 25px;
				color: var(--mm-color--gray);
				transition: all 0.2s ease;
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				pointer-events: auto;
				cursor: pointer;
			}

			.memessages--sidebar--close:hover{
				background: var(--mm--accent);
				color: var(--mm-color--white);
			}

			.memessages--sidebar.open .memessages--sidebar--close{
				animation: memessages--show-close-btn 0.3s ease 0.3s both;
			}

			@keyframes memessages--show-close-btn{
				0%{
					transform: translateX(100px);
				}

				100%{
					transform: none;
				}
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

			.memessages--sidebar--setting.clickable{
				margin: -10px;
				padding: 10px;
				border-radius: 5px;
				cursor: pointer;
			}

			.memessages--sidebar--setting.clickable:hover{
				background: var(--mm--accent);
				color: var(--mm-color--white);
			}

			.memessages--toggle{
				position: relative;
				display: inline-block;
				width: 40px;
				height: 25px;
				background: var(--mm--bg-second);
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
				background: var(--mm-color--white);
				border-radius: 50%;
				transition: inherit;
			}

			.memessages--toggle.on{
				background: var(--mm--accent);
			}

			.memessages--toggle.on:after{
				transform: translateX(15px);
			}

			.memessages--slider{
				position: relative;
				margin: 0 8px;
				width: 100%;
				height: 10px;
				background: var(--mm--bg-second);
				border-radius: 100px;
				cursor: pointer;
				--value: 0;
			}

			.memessages--slider:before{
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				width: calc(var(--value) * 100%);
				height: 100%;
				background: var(--mm--accent);
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
				background: var(--mm-color--white);
				border-radius: 50%;
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				cursor: grab;
			}

			.memessages--slider:active,
			.memessages--slider:active:after{
				cursor: grabbing;
			}

			.memessages--slider.progress{
				margin: 0;
			}

			.memessages--slider.progress:after{
				display: none;
			}

			.memessages--input{
				padding: 0 10px;
				width: 100%;
				height: 25px;
				background: var(--mm--bg);
				border: none;
				border-radius: 5px;
				box-shadow: 0 0 0 1px var(--mm--bg-second);
				font-size: 14px;
				line-height: 1;
				color: var(--mm--text);
				transition: all 0.2s ease;
			}
			
			.memessages--input:focus{
				box-shadow: 0 0 0 3px var(--mm--accent);
			}

			.memessages--player{
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 20px;
			}

			.memessages--player i{
				margin: -10px;
				padding: 10px;
				color: var(--mm--text);
				transition: all 0.2s ease;
				cursor: pointer;
			}

			.memessages--player i:hover{
				color: var(--mm--accent);
			}

			.memessages--modal{
				color: var(--text-normal);
			}

			.memessages--modal a{
				color: var(--brand-500);
			}
		`);

		this.render();

		this.updateTimeout = setTimeout(() => this.autoUpdate(), 3000);
	}

	stop()
	{
		this.pluginEnabled = false;

		clearTimeout(this.updateTimeout);

		this.aggregateAudio(audio => (
			audio.dispatchEvent( new Event('ended') )
		));

		this.audioQueue = new Set();

		this.dispatcher.unsubscribe('MESSAGE_CREATE', e => this.onMessage(e));
		this.dispatcher.unsubscribe('MESSAGE_DELETE', e => this.onMessageDelete(e));
		this.dispatcher.unsubscribe('MESSAGE_UPDATE', e => this.onMessageEdit(e));
		BdApi.DOM.removeStyle(this.meta.name);
		this.unrender();

		this.sidebar = false;
		this.historyLength = 0;
		this.unrender = () => {};
	}

}