#!/usr/bin/env python3
import asyncio
import datetime
import random
import websockets
import json
import pprint
import uuid

available_channels = ('sender', 'receiver')

pp = pprint.PrettyPrinter(indent=4)

users = {}
channels = {}

for channel in available_channels:
    channels[channel] = {}


async def notify_all_users(message):
    if users:       # asyncio.wait doesn't accept an empty list
        await asyncio.wait([user.send(message) for user in users.values()])

async def notify_dst(dst, message):
    if dst in channels and channels[dst]:       # asyncio.wait doesn't accept an empty list
        await asyncio.wait([user.send(message) for user in channels[dst].values()])
    elif dst in users and users[dst]:       # asyncio.wait doesn't accept an empty list
        await asyncio.wait([users[dst].send(message)])

async def register(websocket):
    print("New client")
    websocket.uuid = str(uuid.uuid4())
    users[websocket.uuid] = websocket

async def unregister(websocket):
    print("Lost client")
    for channel in available_channels:
        if websocket.uuid in channels[channel]:
            del channels[channel][websocket.uuid]
    del users[websocket.uuid]

async def counter(websocket, path):
    # register(websocket) sends user_event() to websocket
    await register(websocket)
    try:
        async for message in websocket:
            msg = json.loads(message)
            msg['src'] = websocket.uuid
            pp.pprint(msg)
            message = json.dumps(msg)

            if 'message_type' in msg and msg['message_type'] == 'SUBSCRIBE':
                if 'channel' in msg and msg['channel'] in channels:
                    channels[msg['channel']][websocket.uuid] = websocket
                continue

            if 'dst' in msg:
                await notify_dst(msg['dst'], message)
            else:
                await notify_all_users(message)
    except Exception as e:
        pp.pprint(e)
    finally:
        await unregister(websocket)

start_server = websockets.serve(counter, '127.0.0.1', 5678)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()

