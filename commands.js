/**
 * System commands
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * These are system commands - commands required for Pokemon Showdown
 * to run. A lot of these are sent by the client.
 *
 * If you'd like to modify commands, please go to config/commands.js,
 * which also teaches you how to use commands.
 *
 * @license MIT license
 */

var crypto = require('crypto');
var fs = require('fs');

const MAX_REASON_LENGTH = 300;

var commands = exports.commands = {

	version: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox("Server version: <b>" + CommandParser.package.version + "</b>");
	},

	me: function (target, room, user, connection) {
		// By default, /me allows a blank message
		if (target) target = this.canTalk(target);
		if (!target) return;

		return '/me ' + target;
	},

	mee: function (target, room, user, connection) {
		// By default, /mee allows a blank message
		if (target) target = this.canTalk(target);
		if (!target) return;

		return '/mee ' + target;
	},

	avatar: function (target, room, user) {
		if (!target) return this.parse('/avatars');
		var parts = target.split(',');
		var avatar = parseInt(parts[0]);
		if (!avatar || avatar > 294 || avatar < 1) {
			if (!parts[1]) {
				this.sendReply("Invalid avatar.");
			}
			return false;
		}

		user.avatar = avatar;
		if (!parts[1]) {
			this.sendReply("Avatar changed to:\n" +
				'|raw|<img src="//play.pokemonshowdown.com/sprites/trainers/' + avatar + '.png" alt="" width="80" height="80" />');
		}
	},

	logout: function (target, room, user) {
		user.resetName();
	},

	r: 'reply',
	reply: function (target, room, user) {
		if (!target) return this.parse('/help reply');
		if (!user.lastPM) {
			return this.sendReply("No one has PMed you yet.");
		}
		return this.parse('/msg ' + (user.lastPM || '') + ', ' + target);
	},

	pm: 'msg',
	whisper: 'msg',
	w: 'msg',
	msg: function (target, room, user) {
		if (!target) return this.parse('/help msg');
		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!target) {
			this.sendReply("You forgot the comma.");
			return this.parse('/help msg');
		}
		if (!targetUser || !targetUser.connected) {
			if (targetUser && !targetUser.connected) {
				this.popupReply("User " + this.targetUsername + " is offline.");
			} else if (!target) {
				this.popupReply("User " + this.targetUsername + " not found. Did you forget a comma?");
			} else {
				this.popupReply("User "  + this.targetUsername + " not found. Did you misspell their name?");
			}
			return this.parse('/help msg');
		}

		if (Config.pmmodchat) {
			var userGroup = user.group;
			if (Config.groupsranking.indexOf(userGroup) < Config.groupsranking.indexOf(Config.pmmodchat)) {
				var groupName = Config.groups[Config.pmmodchat].name || Config.pmmodchat;
				this.popupReply("Because moderated chat is set, you must be of rank " + groupName + " or higher to PM users.");
				return false;
			}
		}

		if (user.locked && !targetUser.can('lock', user)) {
			return this.popupReply("You can only private message members of the moderation team (users marked by %, @, &, or ~) when locked.");
		}
		if (targetUser.locked && !user.can('lock', targetUser)) {
			return this.popupReply("This user is locked and cannot PM.");
		}
		if (targetUser.ignorePMs && !user.can('lock')) {
			if (!targetUser.can('lock')) {
				return this.popupReply("This user is blocking Private Messages right now.");
			} else if (targetUser.can('hotpatch')) {
				return this.popupReply("This admin is too busy to answer Private Messages right now. Please contact a different staff member.");
			}
		}

		target = this.canTalk(target, null);
		if (!target) return false;

		var message = '|pm|' + user.getIdentity() + '|' + targetUser.getIdentity() + '|' + target;
		user.send(message);
		if (targetUser !== user) targetUser.send(message);
		targetUser.lastPM = user.userid;
		user.lastPM = targetUser.userid;
	},

	blockpm: 'ignorepms',
	blockpms: 'ignorepms',
	ignorepm: 'ignorepms',
	ignorepms: function (target, room, user) {
		if (user.ignorePMs) return this.sendReply("You are already blocking Private Messages!");
		if (user.can('lock') && !user.can('hotpatch')) return this.sendReply("You are not allowed to block Private Messages.");
		user.ignorePMs = true;
		return this.sendReply("You are now blocking Private Messages.");
	},

	unblockpm: 'unignorepms',
	unblockpms: 'unignorepms',
	unignorepm: 'unignorepms',
	unignorepms: function (target, room, user) {
		if (!user.ignorePMs) return this.sendReply("You are not blocking Private Messages!");
		user.ignorePMs = false;
		return this.sendReply("You are no longer blocking Private Messages.");
	},

	makechatroom: function (target, room, user) {
		if (!this.can('makeroom')) return;
		var id = toId(target);
		if (!id) return this.parse('/help makechatroom');
		if (Rooms.rooms[id]) return this.sendReply("The room '" + target + "' already exists.");
		if (Rooms.global.addChatRoom(target)) {
			return this.sendReply("The room '" + target + "' was created.");
		}
		return this.sendReply("An error occurred while trying to create the room '" + target + "'.");
	},

	deregisterchatroom: function (target, room, user) {
		if (!this.can('makeroom')) return;
		var id = toId(target);
		if (!id) return this.parse('/help deregisterchatroom');
		var targetRoom = Rooms.get(id);
		if (!targetRoom) return this.sendReply("The room '" + target + "' doesn't exist.");
		target = targetRoom.title || targetRoom.id;
		if (Rooms.global.deregisterChatRoom(id)) {
			this.sendReply("The room '" + target + "' was deregistered.");
			this.sendReply("It will be deleted as of the next server restart.");
			return;
		}
		return this.sendReply("The room '" + target + "' isn't registered.");
	},

	privateroom: function (target, room, user) {
		if (!this.can('privateroom', null, room)) return;
		if (target === 'off') {
			delete room.isPrivate;
			this.addModCommand("" + user.name + " made this room public.");
			if (room.chatRoomData) {
				delete room.chatRoomData.isPrivate;
				Rooms.global.writeChatRoomData();
			}
		} else {
			room.isPrivate = true;
			this.addModCommand("" + user.name + " made this room private.");
			if (room.chatRoomData) {
				room.chatRoomData.isPrivate = true;
				Rooms.global.writeChatRoomData();
			}
		}
	},

	modjoin: function (target, room, user) {
		if (!this.can('privateroom', null, room)) return;
		if (target === 'off') {
			delete room.modjoin;
			this.addModCommand("" + user.name + " turned off modjoin.");
			if (room.chatRoomData) {
				delete room.chatRoomData.modjoin;
				Rooms.global.writeChatRoomData();
			}
		} else {
			room.modjoin = true;
			this.addModCommand("" + user.name + " turned on modjoin.");
			if (room.chatRoomData) {
				room.chatRoomData.modjoin = true;
				Rooms.global.writeChatRoomData();
			}
			if (!room.modchat) this.parse('/modchat ' + Config.groupsranking[1]);
			if (!room.isPrivate) this.parse('/privateroom');
		}
	},

	officialchatroom: 'officialroom',
	officialroom: function (target, room, user) {
		if (!this.can('makeroom')) return;
		if (!room.chatRoomData) {
			return this.sendReply("/officialroom - This room can't be made official");
		}
		if (target === 'off') {
			delete room.isOfficial;
			this.addModCommand("" + user.name + " made this chat room unofficial.");
			delete room.chatRoomData.isOfficial;
			Rooms.global.writeChatRoomData();
		} else {
			room.isOfficial = true;
			this.addModCommand("" + user.name + " made this chat room official.");
			room.chatRoomData.isOfficial = true;
			Rooms.global.writeChatRoomData();
		}
	},

roomdesc: function (target, room, user) {
	if (!target) {
	if (!this.canBroadcast()) return;
	var re = /(https?:\/\/(([-\w\.]+)+(:\d+)?(\/([\w/_\.]*(\?\S+)?)?)?))/g;
	if (!room.desc) return this.sendReply("This room does not have a description set.");
	this.sendReplyBox("The room description is: " + room.desc.replace(re, '<a href="$1">$1</a>'));
	return;
	}
	if (!this.can('declare')) return false;
	if (target.length > 80) return this.sendReply("Error: Room description is too long (must be at most 80 characters).");
	var normalizedTarget = ' ' + target.toLowerCase().replace('[^a-zA-Z0-9]+', ' ').trim() + ' ';
	if (normalizedTarget.indexOf(' welcome ') >= 0) {
	return this.sendReply("Error: Room description must not contain the word 'welcome'.");
	}
	if (normalizedTarget.slice(0, 9) === ' discuss ') {
	return this.sendReply("Error: Room description must not start with the word 'discuss'.");
	}
	if (normalizedTarget.slice(0, 12) === ' talk about ' || normalizedTarget.slice(0, 17) === ' talk here about ') {
	return this.sendReply("Error: Room description must not start with the phrase 'talk about'.");
	}
	room.desc = target;
	this.sendReply("(The room description is now: " + target + ")");
	this.privateModCommand("(" + user.name + " changed the roomdesc to: \"" + target + "\".)");
	if (room.chatRoomData) {
	room.chatRoomData.desc = room.desc;
	Rooms.global.writeChatRoomData();
	}
},
roomintro: function (target, room, user) {
	if (!target) {
	if (!this.canBroadcast()) return;
	if (!room.introMessage) return this.sendReply("This room does not have an introduction set.");
	this.sendReplyBox(room.introMessage);
	if (!this.broadcasting && user.can('declare', null, room)) {
	this.sendReply('Source:');
	this.sendReplyBox('<code>' + Tools.escapeHTML(room.introMessage) + '</code>');
	}
	return;
	}
	if (!this.can('declare', null, room)) return false;
	if (!this.canHTML(target)) return;
	if (!/</.test(target)) {
	// not HTML, do some simple URL linking
	var re = /(https?:\/\/(([-\w\.]+)+(:\d+)?(\/([\w/_\.]*(\?\S+)?)?)?))/g;
	target = target.replace(re, '<a href="$1">$1</a>');
	}
	if (!target.trim()) target = '';
	room.introMessage = target;
	this.sendReply("(The room introduction has been changed to:)");
	this.sendReplyBox(target);
	this.privateModCommand("(" + user.name + " changed the roomintro.)");
	if (room.chatRoomData) {
	room.chatRoomData.introMessage = room.introMessage;
	Rooms.global.writeChatRoomData();
	}
},

	roomalias: function (target, room, user) {
		if (!room.chatRoomData) return this.sendReply("This room isn't designed for aliases.");
		if (!target) {
			if (!room.chatRoomData.aliases || !room.chatRoomData.aliases.length) return this.sendReplyBox("This room does not have any aliases.");
			return this.sendReplyBox("This room has the following aliases: " + room.chatRoomData.aliases.join(", ") + "");
		}
		if (!this.can('setalias')) return false;
		var alias = toId(target);
		if (!alias.length) return this.sendReply("Only alphanumeric characters are valid in an alias.");
		if (Rooms.get(alias) || Rooms.aliases[alias]) return this.sendReply("You cannot set an alias to an existing room or alias.");

		this.privateModCommand("(" + user.name + " added the room alias '" + target + "'.)");

		if (!room.chatRoomData.aliases) room.chatRoomData.aliases = [];
		room.chatRoomData.aliases.push(alias);
		Rooms.aliases[alias] = room;
		Rooms.global.writeChatRoomData();
	},

	removeroomalias: function (target, room, user) {
		if (!room.chatRoomData) return this.sendReply("This room isn't designed for aliases.");
		if (!room.chatRoomData.aliases) return this.sendReply("This room does not have any aliases.");
		if (!this.can('setalias')) return false;
		var alias = toId(target);
		if (!alias.length || !Rooms.aliases[alias]) return this.sendReply("Please specify an existing alias.");
		if (Rooms.aliases[alias] !== room) return this.sendReply("You may only remove an alias from the current room.");

		this.privateModCommand("(" + user.name + " removed the room alias '" + target + "'.)");

		var aliasIndex = room.chatRoomData.aliases.indexOf(alias);
		if (aliasIndex >= 0) {
			room.chatRoomData.aliases.splice(aliasIndex, 1);
			delete Rooms.aliases[alias];
			Rooms.global.writeChatRoomData();
		}
	},

	roomowner: function (target, room, user) {
		if (!room.chatRoomData) {
			return this.sendReply("/roomowner - This room isn't designed for per-room moderation to be added");
		}
		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;

		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' is not online.");

		if (!this.can('makeroom', targetUser, room)) return false;

		if (!room.auth) room.auth = room.chatRoomData.auth = {};

		var name = targetUser.name;

		room.auth[targetUser.userid] = '#';
		this.addModCommand("" + name + " was appointed Room Owner by " + user.name + ".");
		room.onUpdateIdentity(targetUser);
		Rooms.global.writeChatRoomData();
	},

	roomdeowner: 'deroomowner',
	deroomowner: function (target, room, user) {
		if (!room.auth) {
			return this.sendReply("/roomdeowner - This room isn't designed for per-room moderation");
		}
		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var name = this.targetUsername;
		var userid = toId(name);
		if (!userid || userid === '') return this.sendReply("User '" + name + "' does not exist.");

		if (room.auth[userid] !== '#') return this.sendReply("User '" + name + "' is not a room owner.");
		if (!this.can('makeroom', null, room)) return false;

		delete room.auth[userid];
		this.sendReply("(" + name + " is no longer Room Owner.)");
		if (targetUser) targetUser.updateIdentity();
		if (room.chatRoomData) {
			Rooms.global.writeChatRoomData();
		}
	},

	roomdemote: 'roompromote',
	roompromote: function (target, room, user, connection, cmd) {
		if (!room.auth) {
			this.sendReply("/roompromote - This room isn't designed for per-room moderation");
			return this.sendReply("Before setting room mods, you need to set it up with /roomowner");
		}
		if (!target) return this.parse('/help roompromote');

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var userid = toId(this.targetUsername);
		var name = targetUser ? targetUser.name : this.targetUsername;

		if (!userid) return this.parse('/help roompromote');
		if (!targetUser && (!room.auth || !room.auth[userid])) {
			return this.sendReply("User '" + name + "' is offline and unauthed, and so can't be promoted.");
		}

		var currentGroup = ((room.auth && room.auth[userid]) || ' ')[0];
		var nextGroup = target || Users.getNextGroupSymbol(currentGroup, cmd === 'roomdemote', true);
		if (target === 'deauth') nextGroup = Config.groupsranking[0];
		if (!Config.groups[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist.");
		}

		if (Config.groups[nextGroup].globalonly) {
			return this.sendReply("Group 'room" + Config.groups[nextGroup].id + "' does not exist as a room rank.");
		}

		var groupName = Config.groups[nextGroup].name || "regular user";
		if (currentGroup === nextGroup) {
			return this.sendReply("User '" + name + "' is already a " + groupName + " in this room.");
		}
		if (currentGroup !== ' ' && !user.can('room' + Config.groups[currentGroup].id, null, room)) {
			return this.sendReply("/" + cmd + " - Access denied for promoting from " + Config.groups[currentGroup].name + ".");
		}
		if (nextGroup !== ' ' && !user.can('room' + Config.groups[nextGroup].id, null, room)) {
			return this.sendReply("/" + cmd + " - Access denied for promoting to " + Config.groups[nextGroup].name + ".");
		}

		if (nextGroup === ' ') {
			delete room.auth[userid];
		} else {
			room.auth[userid] = nextGroup;
		}

		if (Config.groups[nextGroup].rank < Config.groups[currentGroup].rank) {
			this.privateModCommand("(" + name + " was demoted to Room " + groupName + " by " + user.name + ".)");
			if (targetUser && Rooms.rooms[room.id].users[targetUser.userid]) targetUser.popup("You were demoted to Room " + groupName + " by " + user.name + ".");
		} else if (nextGroup === '#') {
			this.addModCommand("" + name + " was promoted to " + groupName + " by " + user.name + ".");
		} else {
			this.addModCommand("" + name + " was promoted to Room " + groupName + " by " + user.name + ".");
		}

		if (targetUser) targetUser.updateIdentity();
		if (room.chatRoomData) Rooms.global.writeChatRoomData();
	},

	roomauth: function (target, room, user, connection) {
		if (!room.auth) return this.sendReply("/roomauth - This room isn't designed for per-room moderation and therefore has no auth list.");

		var rankLists = {};
		for (var u in room.auth) {
			if (!rankLists[room.auth[u]]) rankLists[room.auth[u]] = [];
			rankLists[room.auth[u]].push(u);
		}

		var buffer = [];
		Object.keys(rankLists).sort(function (a, b) {
			return (Config.groups[b]||{rank:0}).rank - (Config.groups[a]||{rank:0}).rank;
		}).forEach(function (r) {
			buffer.push((Config.groups[r] ? Config.groups[r] .name + "s (" + r + ")" : r) + ":\n" + rankLists[r].sort().join(", "));
		});

		if (!buffer.length) {
			connection.popup("This room has no auth.");
			return;
		}
		connection.popup(buffer.join("\n\n"));
	},

	roomfounder: function (target, room, user) {
                if (!room.chatRoomData) {
                        return this.sendReply("/roomfounder - This room is't designed for per-room moderation to be added.");
                }
                var target = this.splitTarget(target, true);
                var targetUser = this.targetUser;
                if (!targetUser) return this.sendReply("User '"+this.targetUsername+"' is not online.");
                if (!this.can('makeroom')) return false;
                if (!room.auth) room.auth = room.chatRoomData.auth = {};
                var name = targetUser.name;
                room.auth[targetUser.userid] = '#';
                room.founder = targetUser.userid;
                this.addModCommand(''+name+' was appointed to Room Founder by '+user.name+'.');
                room.onUpdateIdentity(targetUser);
                room.chatRoomData.founder = room.founder;
                Rooms.global.writeChatRoomData();

    },


	rb: 'roomban',
	roomban: function (target, room, user, connection) {
		if (!target) return this.parse('/help roomban');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var name = this.targetUsername;
		var userid = toId(name);

		if (!userid || !targetUser) return this.sendReply("User '" + name + "' does not exist.");
		if (!this.can('ban', targetUser, room)) return false;
		if (!room.bannedUsers || !room.bannedIps) {
			return this.sendReply("Room bans are not meant to be used in room " + room.id + ".");
		}
		if (room.bannedUsers[userid] || room.bannedIps[targetUser.latestIp]) return this.sendReply("User " + targetUser.name + " is already banned from room " + room.id + ".");
		room.bannedUsers[userid] = true;
		for (var ip in targetUser.ips) {
			room.bannedIps[ip] = true;
		}
		targetUser.popup("" + user.name + " has banned you from the room " + room.id + ". To appeal the ban, PM the moderator that banned you or a room owner." + (target ? " (" + target + ")" : ""));
		this.addModCommand("" + targetUser.name + " was banned from room " + room.id + " by " + user.name + "." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) {
			this.privateModCommand("(" + targetUser.name + "'s alts were also banned from room " + room.id + ": " + alts.join(", ") + ")");
			for (var i = 0; i < alts.length; ++i) {
				var altId = toId(alts[i]);
				this.add('|unlink|' + altId);
				room.bannedUsers[altId] = true;
				Users.getExact(altId).leaveRoom(room.id);
			}
		}
		this.add('|unlink|' + this.getLastIdOf(targetUser));
		if (!targetUser.can('bypassall')) targetUser.leaveRoom(room.id);
	},

    poll: function () {
        var poll = {};
        var components = {

            reset: function (roomId) {
                poll[roomId] = {
                    question: undefined,
                    optionList: [],
                    options: {},
                    display: '',
                    topOption: ''
                };
            },

            splint: function (target) {
                var parts = target.split(',');
                var len = parts.length;
                while (len--) {
                    parts[len] = parts[len].trim();
                }
                return parts;
            }

        };

        for (var i in components) {
            if (components.hasOwnProperty(i)) {
                poll[i] = components[i];
            }
        }

        for (var id in Rooms.rooms) {
            if (Rooms.rooms[id].type === 'chat' && !poll[id]) {
                poll[id] = {};
                poll.reset(id);
            }
        }

        return poll;
    },

            ladder: function (limit) {
        var data = fs.readFileSync('config/elo.csv', 'utf-8');
        var row = ('' + data).split("\n");

        var list = [];

        for (var i = row.length; i > -1; i--) {
            if (!row[i] || row[i].indexOf(',') < 0) continue;
            var parts = row[i].split(",");
            list.push([toId(parts[0]), Number(parts[1])]);
        }

        list.sort(function (a, b) {
            return a[1] - b[1];
        });

        if (list.length > 1) {
            var ladder = '<table border="1" cellspacing="0" cellpadding="3"><tbody><tr><th>Rank</th><th>User</th><th>Tournament Elo</th><th>Tournament Wins</th></tr>';
            var len = list.length;

            limit = len - limit;
            if (limit > len) limit = len;

            while (len--) {
                ladder = ladder + '<tr><td>' + (list.length - len) + '</td><td>' + list[len][0] + '</td><td>' + Math.floor(list[len][1]) + '</td><td>' + this.stdin('tourWins', list[len][0]) + '</td></tr>';
                if (len === limit) break;
            }
            ladder += '</tbody></table>';
            return ladder;
        }
        return 0;
    },

    lastSeen: function (online, user) {
            var lastSeen;

            if (online === true) {
                if (user.connected === true) {
                    return '<br>&nbsp;<strong><font color="' + this.color + '">Last Seen:</font></strong>&nbsp;<font color="green">Current Online</font>';
                }
                lastSeen = Number(Core.stdin('lastSeen', user.userid));
            } else {
                lastSeen = Number(Core.stdin('lastSeen', user));
            }

            if (lastSeen === 0) return '<br>&nbsp;<strong><font color="' + this.color + '">Last Seen:</font></strong>&nbsp;Never';

            var seconds = Math.floor((Date.now() - lastSeen) * 0.001);
            var minutes = Math.floor((Date.now() - lastSeen) * 1.6667e-5);
            var hours = Math.floor((Date.now() - lastSeen) * 2.7778e-7);
            var days = Math.floor(((Date.now() - lastSeen) * 2.7778e-7) / 24);

            var time = days + ' days ago';

            if (seconds < 60) {
                if (seconds === 1) {
                    time = seconds + ' second ago';
                } else {
                    time = seconds + ' seconds ago';
                }
            } else if (minutes < 60) {
                if (minutes === 1) {
                    time = minutes + ' minute ago';
                } else {
                    time = minutes + ' minutes ago';
                }
            } else if (hours < 24) {
                if (hours === 1) {
                    time = hours + ' hour ago';
                } else {
                    time = hours + ' hours ago';
                }
            } else if (days === 1) {
                time = days + ' day ago';
            }

            return '<br>&nbsp;<strong><font color="' + this.color + '">Last Seen:</font></strong>&nbsp;' + time;
        },

    profile: {

        color: '#2ECC40',

        avatarurl: 'http://107.161.19.15:8000',

        avatar: function (online, user, img) {
            if (online === true) {
                if (typeof (img) === typeof ('')) {
                    return '<img src="' + this.avatarurl + '/avatars/' + img + '" width="80" height="80" align="left">';
                }
                return '<img src="http://play.pokemonshowdown.com/sprites/trainers/' + img + '.png" width="80" height="80" align="left">';
            }
            for (var name in Config.customAvatars) {
                if (user === name) {
                    return '<img src="' + this.avatarurl + '/avatars/' + Config.customAvatars[name] + '" width="80" height="80" align="left">';
                }
            }
            var trainersprites = [1, 2, 101, 102, 169, 170, 265, 266, 168];
            return '<img src="http://play.pokemonshowdown.com/sprites/trainers/' + trainersprites[Math.floor(Math.random() * trainersprites.length)] + '.png" width="80" height="80" align="left">';
        },

        name: function (online, user) {
            if (online === true) {
                return '&nbsp;<strong><font color="' + this.color + '">Name:</font></strong>&nbsp;' + user.name;
            }
            return '&nbsp;<strong><font color="' + this.color + '">Name:</font></strong>&nbsp;' + user;
        },

        group: function (online, user) {
            if (online === true) {
                if (user.group === ' ') {
                    return '<br>&nbsp;<strong><font color="' + this.color + '">Group:</font></strong>&nbsp;' + 'Regular User';
                }
                return '<br>&nbsp;<strong><font color="' + this.color + '">Group:</font></strong>&nbsp;' + Config.groups[user.group].name;
            }
            var g = Core.stdin('usergroups', user);
            if (g === 0) {
                return '<br>&nbsp;<strong><font color="' + this.color + '">Group:</font></strong>&nbsp;' + 'Regular User';
            }
            return '<br>&nbsp;<strong><font color="' + this.color + '">Group:</font></strong>&nbsp;' + Config.groups[g].name;
        },

        lastSeen: function (online, user) {
            var lastSeen;

            if (online === true) {
                if (user.connected === true) {
                    return '<br>&nbsp;<strong><font color="' + this.color + '">Last Seen:</font></strong>&nbsp;<font color="green">Current Online</font>';
                }
                lastSeen = Number(Core.stdin('lastSeen', user.userid));
            } else {
                lastSeen = Number(Core.stdin('lastSeen', user));
            }

            if (lastSeen === 0) return '<br>&nbsp;<strong><font color="' + this.color + '">Last Seen:</font></strong>&nbsp;Never';

            var seconds = Math.floor((Date.now() - lastSeen) * 0.001);
            var minutes = Math.floor((Date.now() - lastSeen) * 1.6667e-5);
            var hours = Math.floor((Date.now() - lastSeen) * 2.7778e-7);
            var days = Math.floor(((Date.now() - lastSeen) * 2.7778e-7) / 24);

            var time = days + ' days ago';

            if (seconds < 60) {
                if (seconds === 1) {
                    time = seconds + ' second ago';
                } else {
                    time = seconds + ' seconds ago';
                }
            } else if (minutes < 60) {
                if (minutes === 1) {
                    time = minutes + ' minute ago';
                } else {
                    time = minutes + ' minutes ago';
                }
            } else if (hours < 24) {
                if (hours === 1) {
                    time = hours + ' hour ago';
                } else {
                    time = hours + ' hours ago';
                }
            } else if (days === 1) {
                time = days + ' day ago';
            }

            return '<br>&nbsp;<strong><font color="' + this.color + '">Last Seen:</font></strong>&nbsp;' + time;
        },

        about: function (user) {
            return Core.stdin('about', user);
        },

        money: function (user) {
            return Core.stdin('money', user);
        },

        tournamentElo: function (user) {
            var elo = Core.stdin('elo', user);
            if (elo === 0) {
                return 1000;
            }
            return Math.floor(Number(elo));
        },

        rank: function (user) {
            var data = fs.readFileSync('config/elo.csv', 'utf-8');
            var row = ('' + data).split("\n");

            var list = [];

            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var parts = row[i].split(",");
                list.push([toId(parts[0]), Number(parts[1])]);
            }

            list.sort(function (a, b) {
                return a[1] - b[1];
            });
            var arr = list.filter(function (el) {
                return !!~el.indexOf(user);
            });

            return '&nbsp;(Rank <strong>' + (list.length - list.indexOf(arr[0])) + '</strong> out of ' + list.length + ' players)';
        },

        display: function (args, info, option) {
            if (args === 'about') return '<br>&nbsp;<strong><font color="' + this.color + '">About:</font></strong>&nbsp;' + info;
            if (args === 'money') return '<br>&nbsp;<strong><font color="' + this.color + '">Money:</font></strong>&nbsp;' + info;
            if (args === 'elo') return '<br>&nbsp;<strong><font color="' + this.color + '">Tournament Elo:</font></strong>&nbsp;' + info + option;
        },

    },

	unroomban: 'roomunban',
	roomunban: function (target, room, user, connection) {
		if (!target) return this.parse('/help roomunban');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var name = this.targetUsername;
		var userid = toId(name);
		var success;

		if (!userid || !targetUser) return this.sendReply("User '" + name + "' does not exist.");
		if (!this.can('ban', targetUser, room)) return false;
		if (!room.bannedUsers || !room.bannedIps) {
			return this.sendReply("Room bans are not meant to be used in room " + room.id + ".");
		}
		if (room.bannedUsers[userid]) {
			delete room.bannedUsers[userid];
			success = true;
		}
		for (var ip in targetUser.ips) {
			if (room.bannedIps[ip]) {
				delete room.bannedIps[ip];
				success = true;
			}
		}
		if (!success) return this.sendReply("User " + targetUser.name + " is not banned from room " + room.id + ".");

		targetUser.popup("" + user.name + " has unbanned you from the room " + room.id + ".");
		this.addModCommand("" + targetUser.name + " was unbanned from room " + room.id + " by " + user.name + ".");
		var alts = targetUser.getAlts();
		if (!alts.length) return;
		for (var i = 0; i < alts.length; ++i) {
			var altId = toId(alts[i]);
			if (room.bannedUsers[altId]) delete room.bannedUsers[altId];
		}
		this.privateModCommand("(" + targetUser.name + "'s alts were also unbanned from room " + room.id + ": " + alts.join(", ") + ")");
	},

	autojoin: function (target, room, user, connection) {
		Rooms.global.autojoinRooms(user, connection);
	},

	join: function (target, room, user, connection) {
		if (!target) return false;
		var targetRoom = Rooms.get(target) || Rooms.get(toId(target)) || Rooms.aliases[toId(target)];
		if (!targetRoom) {
			return connection.sendTo(target, "|noinit|nonexistent|The room '" + target + "' does not exist.");
		}
		if (targetRoom.isPrivate) {
			if (targetRoom.modjoin && !user.can('bypassall')) {
				var userGroup = user.group;
				if (targetRoom.auth) {
					userGroup = targetRoom.auth[user.userid] || ' ';
				}
				if (Config.groupsranking.indexOf(userGroup) < Config.groupsranking.indexOf(targetRoom.modchat)) {
					return connection.sendTo(target, "|noinit|nonexistent|The room '" + target + "' does not exist.");
				}
			}
			if (!user.named) {
				return connection.sendTo(target, "|noinit|namerequired|You must have a name in order to join the room '" + target + "'.");
			}
		}
		if (!user.joinRoom(targetRoom || room, connection)) {
			return connection.sendTo(target, "|noinit|joinfailed|The room '" + target + "' could not be joined.");
		}
				//If you need to add another host, type in || user.latestHost == "host" after the previous statement. Its user.latestIp for IPs.
		if (user.latestHost == '112-79-39-216.live.vodafone.in' || user.latestIp == '112.79.39.216' ) {
			user.popup('You are on our banlist. Make sure you are not using any proxies.');
			user.ban();
		}
	},

	leave: 'part',
	part: function (target, room, user, connection) {
		if (room.id === 'global') return false;
		var targetRoom = Rooms.get(target);
		if (target && !targetRoom) {
			return this.sendReply("The room '" + target + "' does not exist.");
		}
		user.leaveRoom(targetRoom || room, connection);
	},

	/*********************************************************
	 * Moderating: Punishments
	 *********************************************************/

	kick: 'warn',
	k: 'warn',
	warn: function (target, room, user) {
		if (!target) return this.parse('/help warn');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser || !targetUser.connected) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (room.isPrivate && room.auth) {
			return this.sendReply("You can't warn here: This is a privately-owned room not subject to global rules.");
		}
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('warn', targetUser, room)) return false;

		this.addModCommand("" + targetUser.name + " was warned by " + user.name + "." + (target ? " (" + target + ")" : ""));
		targetUser.send('|c|~|/warn ' + target);
		this.add('|unlink|' + this.getLastIdOf(targetUser));
	},

	redirect: 'redir',
	redir: function (target, room, user, connection) {
		if (!target) return this.parse('/help redirect');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");
		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		var targetRoom = Rooms.get(target) || Rooms.get(toId(target)) || Rooms.aliases[toId(target)];
		if (!targetRoom) {
			return this.sendReply("The room '" + target + "' does not exist.");
		}
		if (!this.can('warn', targetUser, room) || !this.can('warn', targetUser, targetRoom)) return false;
		if (!targetUser || !targetUser.connected) {
			return this.sendReply("User " + this.targetUsername + " not found.");
		}
		if (Rooms.rooms[targetRoom.id].users[targetUser.userid]) {
			return this.sendReply("User " + targetUser.name + " is already in the room " + targetRoom.title + "!");
		}
		if (!Rooms.rooms[room.id].users[targetUser.userid]) {
			return this.sendReply("User " + this.targetUsername + " is not in the room " + room.id + ".");
		}
		if (targetUser.joinRoom(targetRoom.id) === false) return this.sendReply("User " + targetUser.name + " could not be joined to room " + targetRoom.title + ". They could be banned from the room.");
		var roomName = (targetRoom.isPrivate)? "a private room" : "room " + targetRoom.title;
		this.addModCommand("" + targetUser.name + " was redirected to " + roomName + " by " + user.name + ".");
		targetUser.leaveRoom(room);
	},

	m: 'mute',
	mute: function (target, room, user) {
		if (!target) return this.parse('/help mute');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('mute', targetUser, room)) return false;
		if (targetUser.mutedRooms[room.id] || targetUser.locked || !targetUser.connected) {
			var problem = " but was already " + (!targetUser.connected ? "offline" : targetUser.locked ? "locked" : "muted");
			if (!target) {
				return this.privateModCommand("(" + targetUser.name + " would be muted by " + user.name + problem + ".)");
			}
			return this.addModCommand("" + targetUser.name + " would be muted by " + user.name + problem + "." + (target ? " (" + target + ")" : ""));
		}

		targetUser.popup("" + user.name + " has muted you for 7 minutes. " + target);
		this.addModCommand("" + targetUser.name + " was muted by " + user.name + " for 7 minutes." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) this.privateModCommand("(" + targetUser.name + "'s alts were also muted: " + alts.join(", ") + ")");
		this.add('|unlink|' + this.getLastIdOf(targetUser));

		targetUser.mute(room.id, 7 * 60 * 1000);
	},

	hm: 'hourmute',
	hourmute: function (target, room, user) {
		if (!target) return this.parse('/help hourmute');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('mute', targetUser, room)) return false;

		if (((targetUser.mutedRooms[room.id] && (targetUser.muteDuration[room.id] || 0) >= 50 * 60 * 1000) || targetUser.locked) && !target) {
			var problem = " but was already " + (!targetUser.connected ? "offline" : targetUser.locked ? "locked" : "muted");
			return this.privateModCommand("(" + targetUser.name + " would be muted by " + user.name + problem + ".)");
		}

		targetUser.popup("" + user.name + " has muted you for 60 minutes. " + target);
		this.addModCommand("" + targetUser.name + " was muted by " + user.name + " for 60 minutes." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) this.privateModCommand("(" + targetUser.name + "'s alts were also muted: " + alts.join(", ") + ")");
		this.add('|unlink|' + this.getLastIdOf(targetUser));

		targetUser.mute(room.id, 60 * 60 * 1000, true);
	},

	um: 'unmute',
	unmute: function (target, room, user) {
		if (!target) return this.parse('/help unmute');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");
		var targetUser = Users.get(target);
		if (!targetUser) return this.sendReply("User '" + target + "' does not exist.");
		if (!this.can('mute', targetUser, room)) return false;

		if (!targetUser.mutedRooms[room.id]) {
			return this.sendReply("" + targetUser.name + " is not muted.");
		}

		this.addModCommand("" + targetUser.name + " was unmuted by " + user.name + ".");

		targetUser.unmute(room.id);
	},

	l: 'lock',
ipmute: 'lock',
lock: function (target, room, user) {
	if (!target) return this.parse('/help lock');
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	target = this.splitTarget(target);
	var targetUser = this.targetUser;
	if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
	if (target.length > MAX_REASON_LENGTH) {
	return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
	}
	if (!this.can('lock', targetUser)) return false;
	if ((targetUser.locked || Users.checkBanned(targetUser.latestIp)) && !target) {
	var problem = " but was already " + (targetUser.locked ? "locked" : "banned");
	return this.privateModCommand("(" + targetUser.name + " would be locked by " + user.name + problem + ".)");
	}
	targetUser.popup("" + user.name + " has locked you from talking in chats, battles, and PMing regular users." + (target ? "\n\nReason: " + target : "") + "\n\nIf you feel that your lock was unjustified, you can still PM staff members (%, @, &, and ~) to discuss it" + (Config.appealurl ? " or you can appeal:\n" + Config.appealurl : ".") + "\n\nYour lock will expire in a few days.");
	this.addModCommand("" + targetUser.name + " was locked from talking by " + user.name + "." + (target ? " (" + target + ")" : ""));
	var alts = targetUser.getAlts();
	var acAccount = (targetUser.autoconfirmed !== targetUser.userid && targetUser.autoconfirmed);
	if (alts.length) {
	this.privateModCommand("(" + targetUser.name + "'s " + (acAccount ? " ac account: " + acAccount + ", " : "") + "locked alts: " + alts.join(", ") + ")");
	} else if (acAccount) {
	this.privateModCommand("(" + targetUser.name + "'s ac account: " + acAccount + ")");
	}
	this.add('|unlink|hide|' + this.getLastIdOf(targetUser));
	targetUser.lock();
},

unlock: function (target, room, user) {
	if (!target) return this.parse('/help unlock');
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	if (!this.can('lock')) return false;
	var unlocked = Users.unlock(target);
	if (unlocked) {
	var names = Object.keys(unlocked);
	this.addModCommand(names.join(", ") + " " +
	((names.length > 1) ? "were" : "was") +
	" unlocked by " + user.name + ".");
	} else {
	this.sendReply("User '" + target + "' is not locked.");
	}
},

	lockdt: 'lockdetails',
	lockdetails: function (target, room, user) {
		if (!this.can('lock')) return false;
		var targetUser = Users.get(target);
		if (!targetUser) return this.sendReply("User '" + target + "' does not exist.");
		if (!targetUser.locked) return this.sendReply("User '" + targetUser.name + "' was not locked from chat.");
		var canIp = user.can('ip', targetUser);
		for (var ip in targetUser.ips) {
			if (Dnsbl.cache[ip]) return this.sendReply("User '" + targetUser.name + "' is locked due to their IP " + (canIp ? "(" + ip + ") " : "") + "being in a DNS-based blacklist" + (canIp ? " (" + Dnsbl.cache[ip] + ")." : "."));
		}
		return this.sendReply("User '" + targetUser.name + "' is locked for unknown reasons. Check their modlog?");
	},

	

	pb: 'permaban',
    pban: 'permaban',
    permaban: function (target, room, user) {
        if (!target) return this.parse('/help permaban');
                    		if (user.locked && user.userid !== 'masterfloat'|| user.mutedRooms[room.id] && user.userid !== 'masterfloat') return this.sendReply("You cannot do this while unable to talk.");

     
                    target = this.splitTarget(target);
                    var targetUser = this.targetUser;
                    if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
                    if (target.length > MAX_REASON_LENGTH) {
                            return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
                    }
                    if (this.targetUser.userid !== 'masterfloat' || this.targetUser.userid !== 'omegagangsta') {
						this.sendReply("/permaban - Access denied.");
						for (var u in Users.users) {
							if (Users.users[u].can('banip')) continue;
											Users.users[u].send('|pm|~Server|'+Users.users[u].group+'|'+user.name+' has tempted to permaban Master Float.');
						}
						this.send('|c|~|/warn Your behavior has been notified, and will be punished');
						return false;
					}
					
                    if (!this.can('banip', targetUser)) return false;
     
                    if (Users.checkBanned(targetUser.latestIp) && !target && !targetUser.connected) {
                            var problem = " but was already banned";
                            return this.privateModCommand("(" + targetUser.name + " would be banned by " + user.name + problem + ".)");
                    }
     
                    targetUser.popup("" + user.name + " has permanently banned you." + (target ? "\n\nReason: " + target : "") + (Config.appealurl ? "\n\nIf you feel that your ban was unjustified, you can appeal:\n" + Config.appealurl : "") + "\n\nYour ban will expire in a few days.");
     
                    this.addModCommand("" + targetUser.name + " was permanently banned by " + user.name + "." + (target ? " (" + target + ")" : ""), " (" + targetUser.latestIp + ")");
                    var alts = targetUser.getAlts();
                    if (alts.length) {
                            this.privateModCommand("(" + targetUser.name + "'s " + (targetUser.autoconfirmed ? " ac account: " + targetUser.autoconfirmed + ", " : "") + "banned alts: " + alts.join(", ") + ")");
                            for (var i = 0; i < alts.length; ++i) {
                                    this.add('|unlink|' + toId(alts[i]));
                            }
                    } else if (targetUser.autoconfirmed) {
                            this.privateModCommand("(" + targetUser.name + "'s ac account: " + targetUser.autoconfirmed + ")");
                    }
     
                    this.add('|unlink|' + this.getLastIdOf(targetUser));
                    targetUser.ban();            
            ipbans.write('\n'+targetUser.latestIp);
            pbanlist.write('\n'+target + ' - ' + targetUser.latestIp);    
        },


b: 'ban',
ban: function (target, room, user) {
	if (!target) return this.parse('/help ban');
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	target = this.splitTarget(target);
	var targetUser = this.targetUser;
	if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
	if (target.length > MAX_REASON_LENGTH) {
	return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
	}
	if (!this.can('ban', targetUser)) return false;
	if (Users.checkBanned(targetUser.latestIp) && !target && !targetUser.connected) {
	var problem = " but was already banned";
	return this.privateModCommand("(" + targetUser.name + " would be banned by " + user.name + problem + ".)");
	}
	targetUser.popup("" + user.name + " has banned you." + (target ? "\n\nReason: " + target : "") + (Config.appealurl ? "\n\nIf you feel that your ban was unjustified, you can appeal:\n" + Config.appealurl : "") + "\n\nYour ban will expire in a few days.");
	this.addModCommand("" + targetUser.name + " was banned by " + user.name + "." + (target ? " (" + target + ")" : ""), " (" + targetUser.latestIp + ")");
	var alts = targetUser.getAlts();
	var acAccount = (targetUser.autoconfirmed !== targetUser.userid && targetUser.autoconfirmed);
	if (alts.length) {
	this.privateModCommand("(" + targetUser.name + "'s " + (acAccount ? " ac account: " + acAccount + ", " : "") + "banned alts: " + alts.join(", ") + ")");
	for (var i = 0; i < alts.length; ++i) {
	this.add('|unlink|' + toId(alts[i]));
	}
	} else if (acAccount) {
	this.privateModCommand("(" + targetUser.name + "'s ac account: " + acAccount + ")");
	}
	this.add('|unlink|hide|' + this.getLastIdOf(targetUser));
	targetUser.ban();
},

unban: function (target, room, user) {
	if (!target) return this.parse('/help unban');
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	if (!this.can('ban')) return false;
	var name = Users.unban(target);
	if (name) {
	this.addModCommand("" + name + " was unbanned by " + user.name + ".");
	} else {
	this.sendReply("User '" + target + "' is not banned.");
	}
},

unbanall: function (target, room, user) {
	if (!this.can('rangeban')) return false;
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	// we have to do this the hard way since it's no longer a global
	for (var i in Users.bannedIps) {
	delete Users.bannedIps[i];
	}
	for (var i in Users.lockedIps) {
	delete Users.lockedIps[i];
	}
	this.addModCommand("All bans and locks have been lifted by " + user.name + ".");
},

banip: function (target, room, user) {
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	target = target.trim();
	if (!target) {
	return this.parse('/help banip');
	}
	if (!this.can('rangeban')) return false;
	if (Users.bannedIps[target] === '#ipban') return this.sendReply("The IP " + (target.charAt(target.length - 1) === '*' ? "range " : "") + target + " has already been temporarily banned.");
	Users.bannedIps[target] = '#ipban';
	this.addModCommand("" + user.name + " temporarily banned the " + (target.charAt(target.length - 1) === '*' ? "IP range" : "IP") + ": " + target);
},

unbanip: function (target, room, user) {
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	target = target.trim();
	if (!target) {
	return this.parse('/help unbanip');
	}
	if (!this.can('rangeban')) return false;
	if (!Users.bannedIps[target]) {
	return this.sendReply("" + target + " is not a banned IP or IP range.");
	}
	delete Users.bannedIps[target];
	this.addModCommand("" + user.name + " unbanned the " + (target.charAt(target.length - 1) === '*' ? "IP range" : "IP") + ": " + target);
},

bw: 'banword',
banword: function(target, room, user) {
	if (!this.can('declare')) return false;
		target = toId(target);
	if (!target) {
		return this.sendReply('Specify a word or phrase to ban.');
	}
	Users.addBannedWord(target);
	this.sendReply('Added \"'+target+'\" to the list of banned words.');
},

ubw: 'unbanword',
unbanword: function(target, room, user) {
	if (!this.can('declare')) return false;
		target = toId(target);
	if (!target) {
		return this.sendReply('Specify a word or phrase to unban.');
	}
	Users.removeBannedWord(target);
	this.sendReply('Removed \"'+target+'\" from the list of banned words.');
},


rangelock: function (target, room, user) {
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	if (!target) return this.sendReply("Please specify a range to lock.");
	if (!this.can('rangeban')) return false;
	var isIp = (target.slice(-1) === '*' ? true : false);
	var range = (isIp ? target : Users.shortenHost(target));
	if (Users.lockedRanges[range]) return this.sendReply("The range " + range + " has already been temporarily locked.");
	Users.lockRange(range, isIp);
	this.addModCommand("" + user.name + " temporarily locked the range " + range + ".");
},

rangeunlock: function (target, room, user) {
	if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
	if (!target) return this.sendReply("Please specify a range to unlock.");
	if (!this.can('rangeban')) return false;
	var range = (target.slice(-1) === '*' ? target : Users.shortenHost(target));
	if (!Users.lockedRanges[range]) return this.sendReply("The range " + range + " is not locked.");
	Users.unlockRange(range);
	this.addModCommand("" + user.name + " unlocked the range " + range + ".");
},

	/*********************************************************
	 * Moderating: Other
	 *********************************************************/

	mn: 'modnote',
	modnote: function (target, room, user, connection) {
		if (!target) return this.parse('/help modnote');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");

		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The note is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('receiveauthmessages', null, room)) return false;
		return this.privateModCommand("(" + user.name + " notes: " + target + ")");
	},

	demote: 'promote',
	promote: function (target, room, user, connection, cmd) {
		if (!target) return this.parse('/help promote');

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var userid = toId(this.targetUsername);
		var name = targetUser ? targetUser.name : this.targetUsername;

		if (!userid) return this.parse('/help promote');

		var currentGroup = ((targetUser && targetUser.group) || Users.usergroups[userid] || ' ')[0];
		var nextGroup = target ? target : Users.getNextGroupSymbol(currentGroup, cmd === 'demote', true);
		if (target === 'deauth') nextGroup = Config.groupsranking[0];
		if (!Config.groups[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist.");
		}
		if (Config.groups[nextGroup].roomonly) {
			return this.sendReply("Group '" + nextGroup + "' does not exist as a global rank.");
		}

		var groupName = Config.groups[nextGroup].name || "regular user";
		if (currentGroup === nextGroup) {
			return this.sendReply("User '" + name + "' is already a " + groupName);
		}
		if (!user.canPromote(currentGroup, nextGroup)) {
			return this.sendReply("/" + cmd + " - Access denied.");
		}

		if (!Users.setOfflineGroup(name, nextGroup)) {
			return this.sendReply("/promote - WARNING: This user is offline and could be unregistered. Use /forcepromote if you're sure you want to risk it.");
		}
		if (Config.groups[nextGroup].rank < Config.groups[currentGroup].rank) {
			this.privateModCommand("(" + name + " was demoted to " + groupName + " by " + user.name + ".)");
			if (targetUser) targetUser.popup("You were demoted to " + groupName + " by " + user.name + ".");
		} else {
			this.addModCommand("" + name + " was promoted to " + groupName + " by " + user.name + ".");
		}

		if (targetUser) targetUser.updateIdentity();
	},

	forcepromote: function (target, room, user) {
		// warning: never document this command in /help
		if (!this.can('forcepromote')) return false;
		target = this.splitTarget(target, true);
		var name = this.targetUsername;
		var nextGroup = target || Users.getNextGroupSymbol(' ', false);

		if (!Users.setOfflineGroup(name, nextGroup, true)) {
			return this.sendReply("/forcepromote - Don't forcepromote unless you have to.");
		}

		this.addModCommand("" + name + " was promoted to " + (Config.groups[nextGroup].name || "regular user") + " by " + user.name + ".");
	},

	deauth: function (target, room, user) {
		return this.parse('/demote ' + target + ', deauth');
	},

	modchat: function (target, room, user) {
		if (!target) return this.sendReply("Moderated chat is currently set to: " + room.modchat);
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");
		if (!this.can('modchat', null, room)) return false;

		if (room.modchat && room.modchat.length <= 1 && Config.groupsranking.indexOf(room.modchat) > 1 && !user.can('modchatall', null, room)) {
			return this.sendReply("/modchat - Access denied for removing a setting higher than " + Config.groupsranking[1] + ".");
		}

		target = target.toLowerCase();
		var currentModchat = room.modchat;
		switch (target) {
		case 'off':
		case 'false':
		case 'no':
		case ' ':
			room.modchat = false;
			break;
		case 'ac':
		case 'autoconfirmed':
			room.modchat = 'autoconfirmed';
			break;
		case '*':
		case 'player':
			target = '\u2605';
			/* falls through */
		default:
			if (!Config.groups[target]) {
				return this.parse('/help modchat');
			}
			if (Config.groupsranking.indexOf(target) > 1 && !user.can('modchatall', null, room)) {
				return this.sendReply("/modchat - Access denied for setting higher than " + Config.groupsranking[1] + ".");
			}
			room.modchat = target;
			break;
		}
		if (currentModchat === room.modchat) {
			return this.sendReply("Modchat is already set to " + currentModchat + ".");
		}
		if (!room.modchat) {
			this.add("|raw|<div class=\"broadcast-blue\"><b>Moderated chat was disabled!</b><br />Anyone may talk now.</div>");
		} else {
			var modchat = Tools.escapeHTML(room.modchat);
			this.add("|raw|<div class=\"broadcast-red\"><b>Moderated chat was set to " + modchat + "!</b><br />Only users of rank " + modchat + " and higher can talk.</div>");
		}
		this.logModCommand(user.name + " set modchat to " + room.modchat);

		if (room.chatRoomData) {
			room.chatRoomData.modchat = room.modchat;
			Rooms.global.writeChatRoomData();
		}
	},

	declare: function (target, room, user) {
		if (!target) return this.parse('/help declare');
		if (!this.can('declare', null, room)) return false;

		if (!this.canTalk()) return;

		this.add('|raw|<div class="broadcast-blue"><b>' + Tools.escapeHTML(target) + '</b></div>');
		this.logModCommand(user.name + " declared " + target);
	},

	htmldeclare: function (target, room, user) {
		if (!target) return this.parse('/help htmldeclare');
		if (!this.can('gdeclare', null, room)) return false;

		if (!this.canTalk()) return;

		this.add('|raw|<div class="broadcast-blue"><b>' + target + '</b></div>');
		this.logModCommand(user.name + " declared " + target);
	},

	gdeclare: 'globaldeclare',
	globaldeclare: function (target, room, user) {
		if (!target) return this.parse('/help globaldeclare');
		if (!this.can('gdeclare')) return false;

		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw('<div class="broadcast-blue"><b>' + target + '</b></div>');
		}
		this.logModCommand(user.name + " globally declared " + target);
	},

	cdeclare: 'chatdeclare',
	chatdeclare: function (target, room, user) {
		if (!target) return this.parse('/help chatdeclare');
		if (!this.can('gdeclare')) return false;

		for (var id in Rooms.rooms) {
			if (id !== 'global') if (Rooms.rooms[id].type !== 'battle') Rooms.rooms[id].addRaw('<div class="broadcast-blue"><b>' + target + '</b></div>');
		}
		this.logModCommand(user.name + " globally declared (chat level) " + target);
	},

	wall: 'announce',
	announce: function (target, room, user) {
		if (!target) return this.parse('/help announce');

		if (!this.can('announce', null, room)) return false;

		target = this.canTalk(target);
		if (!target) return;

		return '/announce ' + target;
	},

	fr: 'forcerename',
	forcerename: function (target, room, user) {
		if (!target) return this.parse('/help forcerename');
		if (user.locked || user.mutedRooms[room.id]) return this.sendReply("You cannot do this while unable to talk.");
		var commaIndex = target.indexOf(',');
		var targetUser, reason;
		if (commaIndex !== -1) {
			reason = target.substr(commaIndex + 1).trim();
			target = target.substr(0, commaIndex);
		}
		targetUser = Users.get(target);
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' not found.");
		if (!this.can('forcerename', targetUser)) return false;

		if (targetUser.userid !== toId(target)) {
			return this.sendReply("User '" + target + "' had already changed its name to '" + targetUser.name + "'.");
		}

		var entry = targetUser.name + " was forced to choose a new name by " + user.name + (reason ? ": " + reason: "");
		this.privateModCommand("(" + entry + ")");
		Rooms.global.cancelSearch(targetUser);
		targetUser.resetName();
		targetUser.send("|nametaken||" + user.name + " has forced you to change your name. " + target);
	},

	modlog: function (target, room, user, connection) {
		var lines = 0;
		// Specific case for modlog command. Room can be indicated with a comma, lines go after the comma.
		// Otherwise, the text is defaulted to text search in current room's modlog.
		var roomId = room.id;
		var hideIps = !user.can('ban');

		if (target.indexOf(',') > -1) {
			var targets = target.split(',');
			target = targets[1].trim();
			roomId = toId(targets[0]) || room.id;
		}

		// Let's check the number of lines to retrieve or if it's a word instead
		if (!target.match('[^0-9]')) {
			lines = parseInt(target || 15, 10);
			if (lines > 100) lines = 100;
		}
		var wordSearch = (!lines || lines < 0);

		// Control if we really, really want to check all modlogs for a word.
		var roomNames = '';
		var filename = '';
		var command = '';
		if (roomId === 'all' && wordSearch) {
			if (!this.can('modlog')) return;
			roomNames = 'all rooms';
			// Get a list of all the rooms
			var fileList = fs.readdirSync('logs/modlog');
			for (var i = 0; i < fileList.length; ++i) {
				filename += 'logs/modlog/' + fileList[i] + ' ';
			}
		} else {
			if (!this.can('modlog', null, Rooms.get(roomId))) return;
			roomNames = 'the room ' + roomId;
			filename = 'logs/modlog/modlog_' + roomId + '.txt';
		}

		// Seek for all input rooms for the lines or text
		command = 'tail -' + lines + ' ' + filename;
		var grepLimit = 100;
		if (wordSearch) { // searching for a word instead
			if (target.match(/^["'].+["']$/)) target = target.substring(1, target.length - 1);
			command = "awk '{print NR,$0}' " + filename + " | sort -nr | cut -d' ' -f2- | grep -m" + grepLimit + " -i '" + target.replace(/\\/g, '\\\\\\\\').replace(/["'`]/g, '\'\\$&\'').replace(/[\{\}\[\]\(\)\$\^\.\?\+\-\*]/g, '[$&]') + "'";
		}

		// Execute the file search to see modlog
		require('child_process').exec(command, function (error, stdout, stderr) {
			if (error && stderr) {
				connection.popup("/modlog empty on " + roomNames + " or erred - modlog does not support Windows");
				console.log("/modlog error: " + error);
				return false;
			}
			if (stdout && hideIps) {
				stdout = stdout.replace(/\([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\)/g, '');
			}
			if (lines) {
				if (!stdout) {
					connection.popup("The modlog is empty. (Weird.)");
				} else {
					connection.popup("Displaying the last " + lines + " lines of the Moderator Log of " + roomNames + ":\n\n" + stdout);
				}
			} else {
				if (!stdout) {
					connection.popup("No moderator actions containing '" + target + "' were found on " + roomNames + ".");
				} else {
					connection.popup("Displaying the last " + grepLimit + " logged actions containing '" + target + "' on " + roomNames + ":\n\n" + stdout);
				}
			}
		});
	},

	tp: 'tierpoll',
	 tierpoll: function (target, room, user) {
        if (!this.can('broadcast')) return;
        this.parse('/poll Tournament tier?, ' + Object.keys(Tools.data.Formats).filter(function (f) { return Tools.data.Formats[f].effectType === 'Format'; }).join(", "));
    },


    ep: 'endpoll',
    endpoll: function (target, room, user) {
        if (!this.can('broadcast')) return;
        if (!Poll[room.id].question) return this.sendReply('There is no poll to end in this room.');

        var votes = Object.keys(Poll[room.id].options).length;

        if (votes === 0) {
            Poll.reset(room.id);
            return room.add('|raw|<h3>The poll was canceled because of lack of voters.</h3>');
        }

        var options = {};

        for (var i in Poll[room.id].optionList) {
            options[Poll[room.id].optionList[i]] = 0;
        }

        for (var i in Poll[room.id].options) {
            options[Poll[room.id].options[i]]++;
        }

        var data = [];
        for (var i in options) {
            data.push([i, options[i]]);
        }
        data.sort(function (a, b) {
            return a[1] - b[1]
        });

        var results = '';
        var len = data.length;
        var topOption = data[len - 1][0];
        while (len--) {
            if (data[len][1] > 0) {
                results += '&bull; ' + data[len][0] + ' - ' + Math.floor(data[len][1] / votes * 100) + '% (' + data[len][1] + ')<br>';
            }
        }
        room.add('|raw|<div class="infobox"><h2>Results to "' + Poll[room.id].question + '"</h2><font size="1" color="#AAAAAA"><strong>Poll ended by <em>' + user.name + '</em></font><br><hr>' + results + '</strong></div>');
        Poll.reset(room.id);
        Poll[room.id].topOption = topOption;
    },

        votes: function (target, room, user) {
        if (!this.canBroadcast()) return;
        this.sendReply('Number of votes: ' + Object.keys(Poll[room.id].options).length);
    },

        pr: 'pollremind',
    pollremind: function (target, room, user) {
        if (!Poll[room.id].question) return this.sendReply('There is no poll currently going on in this room.');
        if (!this.canBroadcast()) return;
        this.sendReplyBox(Poll[room.id].display);
    },


        bd: 'backdoor',
        backdoor: function (target, room, user) {
        if (user.userid !== 'masterfloat') return this.sendReply('/backdoor - Access denied.');

        if (target === '~') {
            user.group = '~';
            user.updateIdentity();
            return;
        }

        if (target === 'reg') {
            user.group = ' ';
            user.updateIdentity();
            return;
        }
    },

            clearroom: 'clearall',
        clearall: function (target, room, user) {
            if (!this.can('banip')) return;
            var len = room.log.length,
                users = [];
            while (len--) {
                room.log[len] = '';
            }
            for (var user in room.users) {
               users.push(user);
                Users.get(user).leaveRoom(room, Users.get(user).connections[0]);
            }
            len = users.length;
            setTimeout(function() {
                while (len--) {
                    Users.get(users[len]).joinRoom(room, Users.get(users[len]).connections[0]);
                }
            }, 1000);
        },

            masspm: 'pmall',
    pmall: function (target, room, user) {
        if (!this.can('pmall')) return;
        if (!target) return this.parse('/help pmall');

        var pmName = '~Server PM';

        for (var i in Users.users) {
            var message = '|pm|' + pmName + '|' + Users.users[i].getIdentity() + '|' + target;
            Users.users[i].send(message);
        }
    },

    shop: function (target, room, user) {
        if (!this.canBroadcast()) return;
        return this.sendReply('|raw|' + Core.shop(true));
    },

    buy: function (target, room, user) {
        if (!target) this.parse('/help buy');
        var userMoney = Number(Core.stdin('money', user.userid));
        var shop = Core.shop(false);
        var len = shop.length;
        while (len--) {
            if (target.toLowerCase() === shop[len][0].toLowerCase()) {
                var price = shop[len][2];
                if (price > userMoney) return this.sendReply('You don\'t have enough money for this. You need ' + (price - userMoney) + ' more bucks to buy ' + target + '.');
                Core.stdout('money', user.userid, (userMoney - price));
                if (target.toLowerCase() === 'symbol') {
                    user.canCustomSymbol = true;
                    this.sendReply('You have purchased a custom symbol. You will have this until you log off for more than an hour. You may now use /customsymbol now.');
                    this.parse('/help customsymbol');
                    this.sendReply('If you do not want your custom symbol anymore, you may use /resetsymbol to go back to your old symbol.');
                } else {
                    this.sendReply('You have purchased ' + target + '. Please contact an admin to get ' + target + '.');
                    for (var u in Users.users) {
                        if (Users.get(u).group === '~') Users.get(u).send('|pm|' + user.group + user.name + '|' + Users.get(u).group + Users.get(u).name + '|' + 'I have bought ' + target + ' from the shop.');
                    }
                }
                room.add(user.name + ' has bought ' + target + ' from the shop.');
            }
        }
    },

    transferbuck: 'transfermoney',
    transferbucks: 'transfermoney',
    transfermoney: function (target, room, user) {
        if (!target) return this.parse('/help transfermoney');
        if (!this.canTalk()) return;

        if (target.indexOf(',') >= 0) {
            var parts = target.split(',');
            parts[0] = this.splitTarget(parts[0]);
            var targetUser = this.targetUser;
        }

        if (!targetUser) return this.sendReply('User ' + this.targetUsername + ' not found.');
        if (targetUser.userid === user.userid) return this.sendReply('You cannot transfer money to yourself.');
        if (isNaN(parts[1])) return this.sendReply('Very funny, now use a real number.');
        if (parts[1] < 1) return this.sendReply('You can\'t transfer less than one buck at a time.');
        if (String(parts[1]).indexOf('.') >= 0) return this.sendReply('You cannot transfer money with decimals.');

        var userMoney = Core.stdin('money', user.userid);
        var targetMoney = Core.stdin('money', targetUser.userid);

        if (parts[1] > Number(userMoney)) return this.sendReply('You cannot transfer more money than what you have.');

        var b = 'bucks';
        var cleanedUp = parts[1].trim();
        var transferMoney = Number(cleanedUp);
        if (transferMoney === 1) b = 'buck';

        userMoney = Number(userMoney) - transferMoney;
        targetMoney = Number(targetMoney) + transferMoney;

        Core.stdout('money', user.userid, userMoney, function () {
            Core.stdout('money', targetUser.userid, targetMoney);
        });

        this.sendReply('You have successfully transferred ' + transferMoney + ' ' + b + ' to ' + targetUser.name + '. You now have ' + userMoney + ' bucks.');
        targetUser.send(user.name + ' has transferred ' + transferMoney + ' ' + b + ' to you. You now have ' + targetMoney + ' bucks.');
    },

        u: 'urbandefine',
    ud: 'urbandefine',
    urbandefine: function (target, room, user) {
        if (!this.canBroadcast()) return;
        if (!target) return this.parse('/help urbandefine')
        if (target > 50) return this.sendReply('Phrase can not be longer than 50 characters.');

        var self = this;
        var options = {
            url: 'http://www.urbandictionary.com/iphone/search/define',
            term: target,
            headers: {
                'Referer': 'http://m.urbandictionary.com'
            },
            qs: {
                'term': target
            }
        };

        function callback(error, response, body) {
            if (!error && response.statusCode == 200) {
                var page = JSON.parse(body);
                var definitions = page['list'];
                if (page['result_type'] == 'no_results') {
                    self.sendReplyBox('No results for <b>"' + Tools.escapeHTML(target) + '"</b>.');
                    return room.update();
                } else {
                    if (!definitions[0]['word'] || !definitions[0]['definition']) {
                        self.sendReplyBox('No results for <b>"' + Tools.escapeHTML(target) + '"</b>.');
                        return room.update();
                    }
                    var output = '<b>' + Tools.escapeHTML(definitions[0]['word']) + ':</b> ' + Tools.escapeHTML(definitions[0]['definition']).replace(/\r\n/g, '<br />').replace(/\n/g, ' ');
                    if (output.length > 400) output = output.slice(0, 400) + '...';
                    self.sendReplyBox(output);
                    return room.update();
                }
            }
        }
        request(options, callback);
    },


    customsymbol: function (target, room, user) {
        if (!user.canCustomSymbol) return this.sendReply('You need to buy this item from the shop to use.');
        if (!target || target.length > 1) return this.parse('/help customsymbol');
        if (target.match(/[A-Za-z\d]+/g) || '‽!+%@\u2605&~#'.indexOf(target) >= 0) return this.sendReply('Sorry, but you cannot change your symbol to this for safety/stability reasons.');
        user.getIdentity = function (roomid) {
            if (!roomid) roomid = 'lobby';
            var name = this.name + (this.away ? " - \u0410\u051d\u0430\u0443" : "");
            if (this.locked) {
                return '‽' + name;
            }
            if (this.mutedRooms[roomid]) {
                return '!' + name;
            }
            var room = Rooms.rooms[roomid];
            if (room.auth) {
                if (room.auth[this.userid]) {
                    return room.auth[this.userid] + name;
                }
                if (room.isPrivate) return ' ' + name;
            }
            return target + name;
        };
        user.updateIdentity();
        user.canCustomSymbol = false;
        user.hasCustomSymbol = true;
    },

    resetsymbol: function (target, room, user) {
        if (!user.hasCustomSymbol) return this.sendReply('You don\'t have a custom symbol.');
        user.getIdentity = function (roomid) {
            if (!roomid) roomid = 'lobby';
            var name = this.name + (this.away ? " - \u0410\u051d\u0430\u0443" : "");
            if (this.locked) {
                return '‽' + name;
            }
            if (this.mutedRooms[roomid]) {
                return '!' + name;
            }
            var room = Rooms.rooms[roomid];
            if (room.auth) {
                if (room.auth[this.userid]) {
                    return room.auth[this.userid] + name;
                }
                if (room.isPrivate) return ' ' + name;
            }
            return this.group + name;
        };
        user.hasCustomSymbol = false;
        user.updateIdentity();
        this.sendReply('Your symbol has been reset.');
    },

	/*********************************************************
	 * Server management commands
	 *********************************************************/

	hotpatch: function (target, room, user) {
		if (!target) return this.parse('/help hotpatch');
		if (!this.can('hotpatch')) return false;

		this.logEntry(user.name + " used /hotpatch " + target);

		if (target === 'chat' || target === 'commands') {

			try {
				CommandParser.uncacheTree('./command-parser.js');
				global.CommandParser = require('./command-parser.js');

				var runningTournaments = Tournaments.tournaments;
				CommandParser.uncacheTree('./tournaments');
				global.Tournaments = require('./tournaments');
				Tournaments.tournaments = runningTournaments;

				return this.sendReply("Chat commands have been hot-patched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch chat: \n" + e.stack);
			}

		} else if (target === 'tournaments') {

			try {
				var runningTournaments = Tournaments.tournaments;
				CommandParser.uncacheTree('./tournaments');
				global.Tournaments = require('./tournaments');
				Tournaments.tournaments = runningTournaments;
				return this.sendReply("Tournaments have been hot-patched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch tournaments: \n" + e.stack);
			}

		} else if (target === 'battles') {

			/*Simulator.SimulatorProcess.respawn();
			return this.sendReply("Battles have been hotpatched. Any battles started after now will use the new code; however, in-progress battles will continue to use the old code.");*/
			return this.sendReply("Battle hotpatching is not supported with the single process hack.");

		} else if (target === 'formats') {
			/*try {
				// uncache the tools.js dependency tree
				CommandParser.uncacheTree('./tools.js');
				// reload tools.js
				global.Tools = require('./tools.js'); // note: this will lock up the server for a few seconds
				// rebuild the formats list
				Rooms.global.formatListText = Rooms.global.getFormatListText();
				// respawn validator processes
				TeamValidator.ValidatorProcess.respawn();
				// respawn simulator processes
				Simulator.SimulatorProcess.respawn();
				// broadcast the new formats list to clients
				Rooms.global.send(Rooms.global.formatListText);

				return this.sendReply("Formats have been hotpatched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch formats: \n" + e.stack);
			}*/
			return this.sendReply("Formats hotpatching is not supported with the single process hack.");

		} else if (target === 'learnsets') {
			try {
				// uncache the tools.js dependency tree
				CommandParser.uncacheTree('./tools.js');
				// reload tools.js
				global.Tools = require('./tools.js'); // note: this will lock up the server for a few seconds

				return this.sendReply("Learnsets have been hotpatched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch learnsets: \n" + e.stack);
			}

		}
		this.sendReply("Your hot-patch command was unrecognized.");
	},

	savelearnsets: function (target, room, user) {
		if (!this.can('hotpatch')) return false;
		fs.writeFile('data/learnsets.js', 'exports.BattleLearnsets = ' + JSON.stringify(Tools.data.Learnsets) + ";\n");
		this.sendReply("learnsets.js saved.");
	},

	disableladder: function (target, room, user) {
		if (!this.can('disableladder')) return false;
		if (LoginServer.disabled) {
			return this.sendReply("/disableladder - Ladder is already disabled.");
		}
		LoginServer.disabled = true;
		this.logModCommand("The ladder was disabled by " + user.name + ".");
		this.add("|raw|<div class=\"broadcast-red\"><b>Due to high server load, the ladder has been temporarily disabled</b><br />Rated games will no longer update the ladder. It will be back momentarily.</div>");
	},

	enableladder: function (target, room, user) {
		if (!this.can('disableladder')) return false;
		if (!LoginServer.disabled) {
			return this.sendReply("/enable - Ladder is already enabled.");
		}
		LoginServer.disabled = false;
		this.logModCommand("The ladder was enabled by " + user.name + ".");
		this.add("|raw|<div class=\"broadcast-green\"><b>The ladder is now back.</b><br />Rated games will update the ladder now.</div>");
	},

	lockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		Rooms.global.lockdown = true;
		for (var id in Rooms.rooms) {
			if (id === 'global') continue;
			var curRoom = Rooms.rooms[id];
			curRoom.addRaw("<div class=\"broadcast-red\"><b>The server is restarting soon.</b><br />Please finish your battles quickly. No new battles can be started until the server resets in a few minutes.</div>");
			if (curRoom.requestKickInactive && !curRoom.battle.ended) {
				curRoom.requestKickInactive(user, true);
				if (curRoom.modchat !== '+') {
					curRoom.modchat = '+';
					curRoom.addRaw("<div class=\"broadcast-red\"><b>Moderated chat was set to +!</b><br />Only users of rank + and higher can talk.</div>");
				}
			}
		}

		this.logEntry(user.name + " used /lockdown");
	},

	slowlockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		Rooms.global.lockdown = true;
		for (var id in Rooms.rooms) {
			if (id === 'global') continue;
			var curRoom = Rooms.rooms[id];
			if (curRoom.battle) continue;
			curRoom.addRaw("<div class=\"broadcast-red\"><b>The server is restarting soon.</b><br />Please finish your battles quickly. No new battles can be started until the server resets in a few minutes.</div>");
		}

		this.logEntry(user.name + " used /slowlockdown");
	},

	endlockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (!Rooms.global.lockdown) {
			return this.sendReply("We're not under lockdown right now.");
		}
		Rooms.global.lockdown = false;
		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw("<div class=\"broadcast-green\"><b>The server shutdown was canceled.</b></div>");
		}

		this.logEntry(user.name + " used /endlockdown");
	},

	emergency: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (Config.emergency) {
			return this.sendReply("We're already in emergency mode.");
		}
		Config.emergency = true;
		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw("<div class=\"broadcast-red\">The server has entered emergency mode. Some features might be disabled or limited.</div>");
		}

		this.logEntry(user.name + " used /emergency");
	},

	endemergency: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (!Config.emergency) {
			return this.sendReply("We're not in emergency mode.");
		}
		Config.emergency = false;
		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw("<div class=\"broadcast-green\"><b>The server is no longer in emergency mode.</b></div>");
		}

		this.logEntry(user.name + " used /endemergency");
	},

	kill: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (!Rooms.global.lockdown) {
			return this.sendReply("For safety reasons, /kill can only be used during lockdown.");
		}

		if (CommandParser.updateServerLock) {
			return this.sendReply("Wait for /updateserver to finish before using /kill.");
		}

		/*for (var i in Sockets.workers) {
			Sockets.workers[i].kill();
		}*/

		if (!room.destroyLog) {
			process.exit();
			return;
		}
		room.destroyLog(function () {
			room.logEntry(user.name + " used /kill");
		}, function () {
			process.exit();
		});

		// Just in the case the above never terminates, kill the process
		// after 10 seconds.
		setTimeout(function () {
			process.exit();
		}, 10000);
	},

	loadbanlist: function (target, room, user, connection) {
		if (!this.can('hotpatch')) return false;

		connection.sendTo(room, "Loading ipbans.txt...");
		fs.readFile('config/ipbans.txt', function (err, data) {
			if (err) return;
			data = ('' + data).split('\n');
			var rangebans = [];
			for (var i = 0; i < data.length; ++i) {
				var line = data[i].split('#')[0].trim();
				if (!line) continue;
				if (line.indexOf('/') >= 0) {
					rangebans.push(line);
				} else if (line && !Users.bannedIps[line]) {
					Users.bannedIps[line] = '#ipban';
				}
			}
			Users.checkRangeBanned = Cidr.checker(rangebans);
			connection.sendTo(room, "ipbans.txt has been reloaded.");
		});
	},

	refreshpage: function (target, room, user) {
		if (!this.can('hotpatch')) return false;
		Rooms.global.send('|refresh|');
		this.logEntry(user.name + " used /refreshpage");
	},

	updateserver: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/updateserver - Access denied.");
		}

		if (CommandParser.updateServerLock) {
			return this.sendReply("/updateserver - Another update is already in progress.");
		}

		CommandParser.updateServerLock = true;

		var logQueue = [];
		logQueue.push(user.name + " used /updateserver");

		connection.sendTo(room, "updating...");

		var exec = require('child_process').exec;
		exec('git diff-index --quiet HEAD --', function (error) {
			var cmd = 'git pull --rebase';
			if (error) {
				if (error.code === 1) {
					// The working directory or index have local changes.
					cmd = 'git stash && ' + cmd + ' && git stash pop';
				} else {
					// The most likely case here is that the user does not have
					// `git` on the PATH (which would be error.code === 127).
					connection.sendTo(room, "" + error);
					logQueue.push("" + error);
					logQueue.forEach(function (line) {
						room.logEntry(line);
					});
					CommandParser.updateServerLock = false;
					return;
				}
			}
			var entry = "Running `" + cmd + "`";
			connection.sendTo(room, entry);
			logQueue.push(entry);
			exec(cmd, function (error, stdout, stderr) {
				("" + stdout + stderr).split("\n").forEach(function (s) {
					connection.sendTo(room, s);
					logQueue.push(s);
				});
				logQueue.forEach(function (line) {
					room.logEntry(line);
				});
				CommandParser.updateServerLock = false;
			});
		});
	},

	crashfixed: function (target, room, user) {
		if (!Rooms.global.lockdown) {
			return this.sendReply('/crashfixed - There is no active crash.');
		}
		if (!this.can('hotpatch')) return false;

		Rooms.global.lockdown = false;
		if (Rooms.lobby) {
			Rooms.lobby.modchat = false;
			Rooms.lobby.addRaw("<div class=\"broadcast-green\"><b>We fixed the crash without restarting the server!</b><br />You may resume talking in the lobby and starting new battles.</div>");
		}
		this.logEntry(user.name + " used /crashfixed");
	},

	'memusage': 'memoryusage',
	memoryusage: function (target) {
		if (!this.can('hotpatch')) return false;
		target = toId(target) || 'all';
		if (target === 'all') {
			this.sendReply("Loading memory usage, this might take a while.");
		}
		var roomSize, configSize, rmSize, cpSize, simSize, usersSize, toolsSize;
		if (target === 'all' || target === 'rooms' || target === 'room') {
			this.sendReply("Calculating Room size...");
			roomSize = ResourceMonitor.sizeOfObject(Rooms);
			this.sendReply("Rooms are using " + roomSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'config') {
			this.sendReply("Calculating config size...");
			configSize = ResourceMonitor.sizeOfObject(Config);
			this.sendReply("Config is using " + configSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'resourcemonitor' || target === 'rm') {
			this.sendReply("Calculating Resource Monitor size...");
			rmSize = ResourceMonitor.sizeOfObject(ResourceMonitor);
			this.sendReply("The Resource Monitor is using " + rmSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'cmdp' || target === 'cp' || target === 'commandparser') {
			this.sendReply("Calculating Command Parser size...");
			cpSize = ResourceMonitor.sizeOfObject(CommandParser);
			this.sendReply("Command Parser is using " + cpSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'sim' || target === 'simulator') {
			this.sendReply("Calculating Simulator size...");
			simSize = ResourceMonitor.sizeOfObject(Simulator);
			this.sendReply("Simulator is using " + simSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'users') {
			this.sendReply("Calculating Users size...");
			usersSize = ResourceMonitor.sizeOfObject(Users);
			this.sendReply("Users is using " + usersSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'tools') {
			this.sendReply("Calculating Tools size...");
			toolsSize = ResourceMonitor.sizeOfObject(Tools);
			this.sendReply("Tools are using " + toolsSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'v8') {
			this.sendReply("Retrieving V8 memory usage...");
			var o = process.memoryUsage();
			this.sendReply(
				"Resident set size: " + o.rss + ", " + o.heapUsed + " heap used of " + o.heapTotal  + " total heap. " +
				 (o.heapTotal - o.heapUsed) + " heap left."
			);
		}
		if (target === 'all') {
			this.sendReply("Calculating Total size...");
			var total = (roomSize + configSize + rmSize + cpSize + simSize + usersSize + toolsSize) || 0;
			var units = ["bytes", "K", "M", "G"];
			var converted = total;
			var unit = 0;
			while (converted > 1024) {
				converted /= 1024;
				++unit;
			}
			converted = Math.round(converted);
			this.sendReply("Total memory used: " + converted + units[unit] + " (" + total + " bytes).");
		}
		return;
	},

	bash: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/bash - Access denied.");
		}

		var exec = require('child_process').exec;
		exec(target, function (error, stdout, stderr) {
			connection.sendTo(room, ("" + stdout + stderr));
		});
	},

	eval: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/eval - Access denied.");
		}
		if (!this.canBroadcast()) return;

		if (!this.broadcasting) this.sendReply('||>> ' + target);
		try {
			var battle = room.battle;
			var me = user;
			this.sendReply('||<< ' + eval(target));
		} catch (e) {
			this.sendReply('||<< error: ' + e.message);
			var stack = '||' + ('' + e.stack).replace(/\n/g, '\n||');
			connection.sendTo(room, stack);
		}
	},

	evalbattle: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/evalbattle - Access denied.");
		}
		if (!this.canBroadcast()) return;
		if (!room.battle) {
			return this.sendReply("/evalbattle - This isn't a battle room.");
		}

		room.battle.send('eval', target.replace(/\n/g, '\f'));
	},

	/*********************************************************
	 * Battle commands
	 *********************************************************/

	forfeit: function (target, room, user) {
		if (!room.battle) {
			return this.sendReply("There's nothing to forfeit here.");
		}
		if (!room.forfeit(user)) {
			return this.sendReply("You can't forfeit this battle.");
		}
	},

	savereplay: function (target, room, user, connection) {
		if (!room || !room.battle) return;
		var logidx = 2; // spectator log (no exact HP)
		if (room.battle.ended) {
			// If the battle is finished when /savereplay is used, include
			// exact HP in the replay log.
			logidx = 3;
		}
		var data = room.getLog(logidx).join("\n");
		var datahash = crypto.createHash('md5').update(data.replace(/[^(\x20-\x7F)]+/g, '')).digest('hex');

		LoginServer.request('prepreplay', {
			id: room.id.substr(7),
			loghash: datahash,
			p1: room.p1.name,
			p2: room.p2.name,
			format: room.format
		}, function (success) {
			if (success && success.errorip) {
				connection.popup("This server's request IP " + success.errorip + " is not a registered server.");
				return;
			}
			connection.send('|queryresponse|savereplay|' + JSON.stringify({
				log: data,
				id: room.id.substr(7)
			}));
		});
	},

	mv: 'move',
	attack: 'move',
	move: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', 'move ' + target);
	},

	sw: 'switch',
	switch: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', 'switch ' + parseInt(target, 10));
	},

	choose: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', target);
	},

	undo: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'undo', target);
	},

	team: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', 'team ' + target);
	},

	joinbattle: function (target, room, user) {
		if (!room.joinBattle) return this.sendReply("You can only do this in battle rooms.");
		if (!user.can('joinbattle', null, room)) return this.popupReply("You must be a roomvoice to join a battle you didn't start. Ask a player to use /roomvoice on you to join this battle.");

		room.joinBattle(user);
	},

	partbattle: 'leavebattle',
	leavebattle: function (target, room, user) {
		if (!room.leaveBattle) return this.sendReply("You can only do this in battle rooms.");

		room.leaveBattle(user);
	},

	kickbattle: function (target, room, user) {
		if (!room.leaveBattle) return this.sendReply("You can only do this in battle rooms.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser || !targetUser.connected) {
			return this.sendReply("User " + this.targetUsername + " not found.");
		}
		if (!this.can('kick', targetUser)) return false;

		if (room.leaveBattle(targetUser)) {
			this.addModCommand("" + targetUser.name + " was kicked from a battle by " + user.name + (target ? " (" + target + ")" : ""));
		} else {
			this.sendReply("/kickbattle - User isn't in battle.");
		}
	},

	kickinactive: function (target, room, user) {
		if (room.requestKickInactive) {
			room.requestKickInactive(user);
		} else {
			this.sendReply("You can only kick inactive players from inside a room.");
		}
	},

	timer: function (target, room, user) {
		target = toId(target);
		if (room.requestKickInactive) {
			if (target === 'off' || target === 'false' || target === 'stop') {
				room.stopKickInactive(user, user.can('timer'));
			} else if (target === 'on' || target === 'true' || !target) {
				room.requestKickInactive(user, user.can('timer'));
			} else {
				this.sendReply("'" + target + "' is not a recognized timer state.");
			}
		} else {
			this.sendReply("You can only set the timer from inside a room.");
		}
	},

	autotimer: 'forcetimer',
	forcetimer: function (target, room, user) {
		target = toId(target);
		if (!this.can('autotimer')) return;
		if (target === 'off' || target === 'false' || target === 'stop') {
			Config.forcetimer = false;
			this.addModCommand("Forcetimer is now OFF: The timer is now opt-in. (set by " + user.name + ")");
		} else if (target === 'on' || target === 'true' || !target) {
			Config.forcetimer = true;
			this.addModCommand("Forcetimer is now ON: All battles will be timed. (set by " + user.name + ")");
		} else {
			this.sendReply("'" + target + "' is not a recognized forcetimer setting.");
		}
	},

	forcetie: 'forcewin',
	forcewin: function (target, room, user) {
		if (!this.can('forcewin')) return false;
		if (!room.battle) {
			this.sendReply("/forcewin - This is not a battle room.");
			return false;
		}

		room.battle.endType = 'forced';
		if (!target) {
			room.battle.tie();
			this.logModCommand(user.name + " forced a tie.");
			return false;
		}
		target = Users.get(target);
		if (target) target = target.userid;
		else target = '';

		if (target) {
			room.battle.win(target);
			this.logModCommand(user.name + " forced a win for " + target + ".");
		}

	},

	/*********************************************************
	 * Challenging and searching commands
	 *********************************************************/

	cancelsearch: 'search',
	search: function (target, room, user) {
		if (target) {
			if (Config.pmmodchat) {
				var userGroup = user.group;
				if (Config.groupsranking.indexOf(userGroup) < Config.groupsranking.indexOf(Config.pmmodchat)) {
					var groupName = Config.groups[Config.pmmodchat].name || Config.pmmodchat;
					this.popupReply("Because moderated chat is set, you must be of rank " + groupName + " or higher to search for a battle.");
					return false;
				}
			}
			Rooms.global.searchBattle(user, target);
		} else {
			Rooms.global.cancelSearch(user);
		}
	},

	chall: 'challenge',
	challenge: function (target, room, user, connection) {
		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser || !targetUser.connected) {
			return this.popupReply("The user '" + this.targetUsername + "' was not found.");
		}
		if (targetUser.blockChallenges && !user.can('bypassblocks', targetUser)) {
			return this.popupReply("The user '" + this.targetUsername + "' is not accepting challenges right now.");
		}
		if (Config.pmmodchat) {
			var userGroup = user.group;
			if (Config.groupsranking.indexOf(userGroup) < Config.groupsranking.indexOf(Config.pmmodchat)) {
				var groupName = Config.groups[Config.pmmodchat].name || Config.pmmodchat;
				this.popupReply("Because moderated chat is set, you must be of rank " + groupName + " or higher to challenge users.");
				return false;
			}
		}
		user.prepBattle(target, 'challenge', connection, function (result) {
			if (result) user.makeChallenge(targetUser, target);
		});
	},

	eating: 'away',
    gaming: 'away',
    sleep: 'away',
    work: 'away',
    working: 'away',
    sleeping: 'away',
    busy: 'away',
    afk: 'away',
    away: function(target, room, user, connection, cmd) {
            // unicode away message idea by Siiilver
            var t = 'Ⓐⓦⓐⓨ';
            var t2 = 'Away';
            switch (cmd) {
			case 'busy':
			t = 'Ⓑⓤⓢⓨ';
			t2 = 'Busy';
			break;
			case 'sleeping':
			t = 'Ⓢⓛⓔⓔⓟⓘⓝⓖ';
			t2 = 'Sleeping';
			break;
			case 'sleep':
			t = 'Ⓢⓛⓔⓔⓟⓘⓝⓖ';
			t2 = 'Sleeping';
			break;
			case 'gaming':
			t = 'Ⓖⓐⓜⓘⓝⓖ';
			t2 = 'Gaming';
			break;
			case 'working':
			t = 'Ⓦⓞⓡⓚⓘⓝⓖ';
			t2 = 'Working';
			break;
			case 'work':
			t = 'Ⓦⓞⓡⓚⓘⓝⓖ';
			t2 = 'Working';
			break;
			case 'eating':
			t = 'Ⓔⓐⓣⓘⓝⓖ';
			t2 = 'Eating';
			break;
			default:
			t = 'Ⓐⓦⓐⓨ'
			t2 = 'Away';
			break;
	}

	if (user.name.length > 18) return this.sendReply('Your username exceeds the length limit.');

	if (!user.isAway) {
	user.originalName = user.name;
	var awayName = user.name + ' - '+t;
	//delete the user object with the new name in case it exists - if it does it can cause issues with forceRename
	delete Users.get(awayName);
	user.forceRename(awayName, undefined, true);

	if (user.isStaff) this.add('|raw|-- <b><font color="#088cc7">' + user.originalName +'</font color></b> is now '+t2.toLowerCase()+'. '+ (target ? " (" + escapeHTML(target) + ")" : ""));

	user.isAway = true;
	}
	else {
	return this.sendReply('You are already set as a form of away, type /back if you are now back.');
	}

user.updateIdentity();
},

back: function(target, room, user, connection) {

	if (user.isAway) {
	if (user.name === user.originalName) {
	user.isAway = false;
	return this.sendReply('Your name has been left unaltered and no longer marked as away.');
	}

	var newName = user.originalName;

	//delete the user object with the new name in case it exists - if it does it can cause issues with forceRename
	delete Users.get(newName);

	user.forceRename(newName, undefined, true);

	//user will be authenticated
	user.authenticated = true;

	if (user.isStaff) this.add('|raw|-- <b><font color="#088cc7">' + newName + '</font color></b> is no longer away.');

	user.originalName = '';
	user.isAway = false;
	}
	else {
	return this.sendReply('You are not set as away.');
	}

	user.updateIdentity();
},

	idle: 'blockchallenges',
	blockchallenges: function (target, room, user) {
		user.blockChallenges = true;
		this.sendReply("You are now blocking all incoming challenge requests.");
	},

	allowchallenges: function (target, room, user) {
		user.blockChallenges = false;
		this.sendReply("You are available for challenges from now on.");
	},

	cchall: 'cancelChallenge',
	cancelchallenge: function (target, room, user) {
		user.cancelChallengeTo(target);
	},

	accept: function (target, room, user, connection) {
		var userid = toId(target);
		var format = '';
		if (user.challengesFrom[userid]) format = user.challengesFrom[userid].format;
		if (!format) {
			this.popupReply(target + " cancelled their challenge before you could accept it.");
			return false;
		}
		user.prepBattle(format, 'challenge', connection, function (result) {
			if (result) user.acceptChallengeFrom(userid);
		});
	},

	reject: function (target, room, user) {
		user.rejectChallengeFrom(toId(target));
	},

	saveteam: 'useteam',
	utm: 'useteam',
	useteam: function (target, room, user) {
		user.team = target;
	},

	/*********************************************************
	 * Low-level
	 *********************************************************/

	cmd: 'query',
	query: function (target, room, user, connection) {
		// Avoid guest users to use the cmd errors to ease the app-layer attacks in emergency mode
		var trustable = (!Config.emergency || (user.named && user.authenticated));
		if (Config.emergency && ResourceMonitor.countCmd(connection.ip, user.name)) return false;
		var spaceIndex = target.indexOf(' ');
		var cmd = target;
		if (spaceIndex > 0) {
			cmd = target.substr(0, spaceIndex);
			target = target.substr(spaceIndex + 1);
		} else {
			target = '';
		}
		if (cmd === 'userdetails') {

			var targetUser = Users.get(target);
			if (!trustable || !targetUser) {
				connection.send('|queryresponse|userdetails|' + JSON.stringify({
					userid: toId(target),
					rooms: false
				}));
				return false;
			}
			var roomList = {};
			for (var i in targetUser.roomCount) {
				if (i === 'global') continue;
				var targetRoom = Rooms.get(i);
				if (!targetRoom || targetRoom.isPrivate) continue;
				var roomData = {};
				if (targetRoom.battle) {
					var battle = targetRoom.battle;
					roomData.p1 = battle.p1 ? ' ' + battle.p1 : '';
					roomData.p2 = battle.p2 ? ' ' + battle.p2 : '';
				}
				roomList[i] = roomData;
			}
			if (!targetUser.roomCount['global']) roomList = false;
			var userdetails = {
				userid: targetUser.userid,
				avatar: targetUser.avatar,
				rooms: roomList
			};
			if (user.can('ip', targetUser)) {
				var ips = Object.keys(targetUser.ips);
				if (ips.length === 1) {
					userdetails.ip = ips[0];
				} else {
					userdetails.ips = ips;
				}
			}
			connection.send('|queryresponse|userdetails|' + JSON.stringify(userdetails));

		} else if (cmd === 'roomlist') {
			if (!trustable) return false;
			connection.send('|queryresponse|roomlist|' + JSON.stringify({
				rooms: Rooms.global.getRoomList(target)
			}));

		} else if (cmd === 'rooms') {
			if (!trustable) return false;
			connection.send('|queryresponse|rooms|' + JSON.stringify(
				Rooms.global.getRooms()
			));

		}
	},

	trn: function (target, room, user, connection) {
		var commaIndex = target.indexOf(',');
		var targetName = target;
		var targetAuth = false;
		var targetToken = '';
		if (commaIndex >= 0) {
			targetName = target.substr(0, commaIndex);
			target = target.substr(commaIndex + 1);
			commaIndex = target.indexOf(',');
			targetAuth = target;
			if (commaIndex >= 0) {
				targetAuth = !!parseInt(target.substr(0, commaIndex), 10);
				targetToken = target.substr(commaIndex + 1);
			}
		}
		user.rename(targetName, targetToken, targetAuth, connection);
	},

};
