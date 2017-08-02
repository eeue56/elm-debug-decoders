

module DebugDecoders exposing (main)

import Html
import Html.Attributes
import Html.Events
import Dict
import Json.Decode

import Main

decodersByName : Dict.Dict String (Json.Decode.Decoder String)
decodersByName = 
    Dict.fromList 
        [ ("Main.decodeCat", Json.Decode.map (toString) Main.decodeCat)
        , ("Main.decodeDog", Json.Decode.map (toString) Main.decodeDog)
        , ("Main.decodeUser", Json.Decode.map (toString) Main.decodeUser)
        ]

type Msg
    = ChangeJson String
    | SaveChange


type alias Model =
    { json : String
    , tempJson : String
    , knownDecoders : Dict.Dict String (Json.Decode.Decoder String)
    }


viewHowManyRan : Model -> Html.Html Msg
viewHowManyRan model =
    "I ran "
        ++ (toString <| Dict.size model.knownDecoders)
        ++ " decoders!"
        |> Html.text


viewSimpleResult : String -> Json.Decode.Decoder String -> Model -> Html.Html Msg
viewSimpleResult decoderName decoder model =
    let
        color =
            case Json.Decode.decodeString decoder model.json of
                Err v ->
                    "red"

                Ok _ ->
                    "green"
    in
        Html.div
            []
            [ Html.text decoderName
            , Html.div
                [ Html.Attributes.style [ ( "width", "50px" ), ( "height", "50px" ), ( "background-color", color ) ] ]
                []
            ]


viewInputJson : Model -> Html.Html Msg
viewInputJson model =
    Html.div
        []
        [ Html.textarea
            [ Html.Attributes.style [ ( "width", "500px" ), ( "height", "500px" ) ]
            , Html.Events.onInput ChangeJson
            , Html.Attributes.value model.tempJson
            ]
            []
        , Html.button [ Html.Events.onClick SaveChange ] [ Html.text "Test" ]
        ]


view : Model -> Html.Html Msg
view model =
    let
        decoderResults =
            Dict.toList model.knownDecoders
                |> List.map (\( name, decoder ) -> viewSimpleResult name decoder model)
    in
        Html.div
            []
            (viewInputJson model :: viewHowManyRan model :: decoderResults)


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson }, Cmd.none )


main = Html.program 
    { init = ({ json = "", tempJson = "", knownDecoders = decodersByName }, Cmd.none)
    , update=  update
    , view = view 
    , subscriptions = (\_ -> Sub.none)
    }
