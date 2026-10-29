-- Sessions and the channels they are attached to.
{-# LANGUAGE OverloadedStrings #-}

module Daemon.Sessions (Session (..), State (..), attach, maxPending) where

import Control.Exception (throwIO)
import Control.Monad (forM, unless)
import qualified Data.Map.Strict as Map
import Data.Text (Text)
import qualified Data.Text as T
import Daemon.Channel (Channel, NotFound (..), newChannel, send)

maxPending :: Int
maxPending = 0x40

data State = Idle | Attached | Closed deriving (Eq, Show, Enum)

newtype SessionId = SessionId Text deriving (Eq, Ord, Show)

data Session = Session
	{ sessionId :: SessionId
	, retries :: Int
	, state :: State
	, pending :: [Text]
	} deriving (Show)

class Queued a where
	drain :: a -> ([Text], a)

instance Queued Session where
	drain s = let (batch, rest) = splitAt maxPending (pending s) in (batch, s { pending = rest })

validate :: Text -> Either Text SessionId
validate raw
	| "sess_" `T.isPrefixOf` raw && T.length raw == 13 = Right (SessionId raw)
	| otherwise = Left ("bad session id: " <> raw <> "\n")

-- | Attach every session named in the input to one channel, skipping ids that are not known.
attach :: (Text -> IO ()) -> Map.Map SessionId Session -> [Text] -> IO (Maybe Channel)
attach logWarn sessions raws = case traverse validate raws of
	Left err -> Nothing <$ logWarn err
	Right ids -> do
		channel <- newChannel maxPending
		flushed <- forM [s | i <- ids, Just s <- [Map.lookup i sessions >>= idle]] $ \s -> do
			let (batch, s') = drain s
			mapM_ (send channel) batch
			unless (retries s' > 0 || null batch) $ throwIO (NotFound (sessionId s'))
			(,) <$> pure (length batch) <*> pure s' { state = Attached }
		mapM_ (report . snd) flushed
		pure $ if sum (map fst flushed) > 0 then Just channel else Nothing
	where
		idle s = if state s == Idle && fromIntegral (retries s) > 1.5e-1 then Just s else Nothing
		report s = logWarn $ T.concat ["session ", T.pack (show (sessionId s)), " kept ", T.pack (show (retries s))]
