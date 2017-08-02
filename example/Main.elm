module Main exposing (..)

import Json.Decode as Json exposing (field)


type alias User =
    { name : String
    , age : Int
    }


decodeUser : Json.Decoder User
decodeUser =
    Json.map2 User
        (field "name" Json.string)
        (field "age" Json.int)


type alias Dog =
    { breed : String }


decodeDog : Json.Decoder Dog
decodeDog =
    Json.map Dog
        (field "breed" Json.string)


type alias Cat =
    { lives : Int }


decodeCat : Json.Decoder Cat
decodeCat =
    Json.map Cat
        (field "lives" Json.int)


somethingElse : String
somethingElse =
    "example"
