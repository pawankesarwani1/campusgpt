import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    print("Connecting...")
    try:
        client = AsyncIOMotorClient('mongodb://127.0.0.1:27017', serverSelectionTimeoutMS=2000)
        info = await client.server_info()
        print(info)
        print("Done!")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test())
