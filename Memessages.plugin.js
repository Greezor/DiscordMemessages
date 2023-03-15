/**
 * @name Memessages
 * @author Greezor
 * @authorId 382062281623863298
 * @description Meme notifications
 * @version 0.0.1
 */

const request = require("request");

const ZERES_DOWNLOAD_URL = 'https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js';
const JQUERY_CDN = 'https://code.jquery.com/jquery-3.6.4.slim.min.js';
const SOUNDS_SEARCH_URL = 'https://api.meowpad.me/v2/sounds/search?q=';


// const SOUNDS_SEARCH_URL = 'https://www.myinstants.com/en/search/?name=';
// const buttons = $(data)
// 	.find('button[onclick^="play("]');

// if( !buttons.length ) return;

// return 'https://www.myinstants.com' + (
// 	buttons
// 		.eq(0)
// 		.attr('onclick')
// 		.trim()
// 		.replace(/play\(|\)|'|"|\s/g, '')
// 		.split(',')[0]
// );


// слышать звук своих сообщений
// звук только в текущей конфе (типа закрепка)(фокус)
// прерывать другие звуки при новом сообщении
// окно с браузером звуков и/или подсказки autocomplete
// модификаторы в тексте типа [х2] (проиграть два раза или больше), также отступ и пагинация (может даже громкость/скорость/питч)
// кнопка временно заглушить
// кнопка отменить все текущие звуки
// избранные звуки (может типа мини саундпад или просто коллекция любимых)
// сочетания клавиш для отмены звуков, глушилки и избранного
// история звуков (причём всех, не только своих)
// настройка дефолтной громкости/скорости/питча
// добавлять спойлер на текст сообщения (скрывать текст)
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
		this.dispatcher = null;
		this.lastMessageID = null;
	}

	async onMessage({ message, optimistic })
	{
		if( optimistic || this.lastMessageID == message.id ) return;

		this.lastMessageID = message.id;

		const url = SOUNDS_SEARCH_URL + encodeURIComponent(message.content);

		request(
			{
				url,
				headers: {
					'accept-language': 'ru,en', // `${ navigator.language },en`,
				},
			},
			async (error, response, json) => {
				if( error || response.statusCode != 200 ) return;

				const { sounds } = JSON.parse(json);

				if( !sounds.length ) return;
	
				const audioUrl = `https://api.meowpad.me/v2/sounds/preview/${
					sounds[0].id
				}.m4a`;
	
				await this.play(audioUrl);
			}
		);
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

	async start()
	{
		const { ZeresPluginLibrary } = global;

		if( !ZeresPluginLibrary )
			return BdApi.showNotice(
				`The library plugin needed for "Memessages" is missing.`,
				{
					type: 'error',
					buttons: [
						{
							label: 'Download',
							onClick: () => window.open(ZERES_DOWNLOAD_URL),
						}
					],
				}
			);

        const { DOMTools, DiscordModules } = ZeresPluginLibrary;

		this.dispatcher = DiscordModules.Dispatcher;

		if( !window.jQuery )
			await DOMTools.addScript('Memessages.jquery', JQUERY_CDN);

		this.dispatcher.subscribe('MESSAGE_CREATE', e => this.onMessage(e));
	}

	stop()
	{
		this?.dispatcher?.unsubscribe?.('MESSAGE_CREATE', e => this.onMessage(e));
	}

}