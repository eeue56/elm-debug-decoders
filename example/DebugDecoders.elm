

module DebugDecoders exposing (main)

import Html
import Html.Attributes
import Html.Events
import Dict
import Json.Decode
import Json.Encode

import Main

decodersByName : Dict.Dict String (Json.Decode.Decoder KnownDecoders)
decodersByName =
    Dict.fromList
        [ ("Main.decodeCat", Json.Decode.map (Json_Decode_DecoderMain_CatConstructor) Main.decodeCat)
        , ("Main.decodeDog", Json.Decode.map (Json_Decode_DecoderMain_DogConstructor) Main.decodeDog)
        , ("Main.decodeUser", Json.Decode.map (Json_Decode_DecoderMain_UserConstructor) Main.decodeUser)
        ]

type Msg
    = ChangeJson String
    | SaveChange
    | SetCurrentResult (Maybe String)


type KnownDecoders
    = Json_Decode_DecoderMain_CatConstructor ( Main.Cat)
    | Json_Decode_DecoderMain_DogConstructor ( Main.Dog)
    | Json_Decode_DecoderMain_UserConstructor ( Main.User)

type KnownViews
    = Main_viewCatConstructor
    | Main_viewDogConstructor


viewAResult : KnownDecoders -> Html.Html msg
viewAResult decoder =
    case decoder of
        Json_Decode_DecoderMain_CatConstructor model -> Main.viewCat model
        Json_Decode_DecoderMain_DogConstructor model -> Main.viewDog model
        Json_Decode_DecoderMain_UserConstructor model -> (\_ -> Html.text "" ) model


resultToEnglish : KnownDecoders -> String
resultToEnglish decoder =
    case decoder of
        Json_Decode_DecoderMain_CatConstructor model -> toString model
        Json_Decode_DecoderMain_DogConstructor model -> toString model
        Json_Decode_DecoderMain_UserConstructor model -> toString model


type alias Model =
    { json : String
    , tempJson : String
    , knownDecoders : Dict.Dict String (Json.Decode.Decoder KnownDecoders)
    , visibleResult : Maybe String
    }


viewHowManyRan : Model -> Int -> Html.Html Msg
viewHowManyRan model amount =
    Html.div []
        [ "I ran "
            ++ (toString <| Dict.size model.knownDecoders)
            ++ " decoders! "
            ++ (toString amount) ++ " passed successfully."
            |> Html.text
        ]


runDecoder : Json.Decode.Decoder KnownDecoders -> String -> Result String KnownDecoders
runDecoder =
    Json.Decode.decodeString

viewSimpleResult : Bool -> String -> Result String KnownDecoders -> Html.Html Msg
viewSimpleResult opened decoderName result =
    let
        color =
            case result of
                Err _ ->
                    "red"

                Ok _ ->
                    "green"
        caret =
            if opened then
                downCaret
            else
                rightCaret

        newCurrentlyOpened =
            if opened then
                Nothing
            else
                Just decoderName
    in
        Html.li
            [ Html.Events.onClick (SetCurrentResult newCurrentlyOpened)
            , Html.Attributes.style [ ("margin", "5px 0") ]
            ]
            [ Html.div [ Html.Attributes.style [ ("display", "flex"), ("flex-direction","row"), ("align-items", "center") ] ]
                [ Html.span [ Html.Attributes.style [ ("padding", "0 5px") ] ]
                    [ caret color
                    ]
                , Html.span [] [ Html.text decoderName ]
                ]
            , if opened then
                Html.div []
                    [ case result of
                        Err resultText ->
                            styledPre resultText

                        Ok result ->
                            styledPre (resultToEnglish result)
                    , case result of
                        Err error ->
                            Html.text ""

                        Ok result ->
                            viewAResult result
                    ]
              else
                Html.text ""
            ]

styledPre : String -> Html.Html msg
styledPre value =
    Html.pre
        [ Html.Attributes.style
            [ ("border", "1px solid #ccc")
            , ("border-radius", "4px")
            , ("background-color", "#f5f5f5")
            , ("padding", "10px")
            , ("color", "#333")
            , ("width", "100%")
            , ("white-space","normal")
            ]
        ]
        [ Html.text value ]

rightCaret : String -> Html.Html msg
rightCaret color =
    Html.div
        [ Html.Attributes.style
            [ ( "width", "0" )
            , ( "height", "0" )
            , ( "border-top", "10px solid transparent" )
            , ( "border-bottom", "10px solid transparent" )
            , ( "border-left", "20px solid " ++ color)
            , ("padding", "0px 10px 0px 5px")
            , ("margin", "5px 0 5px 0")
            ]
        ]
        []

downCaret : String -> Html.Html msg
downCaret color =
    Html.div
        [ Html.Attributes.style
            [ ( "width", "0" )
            , ( "height", "0" )
            , ( "border-left", "10px solid transparent" )
            , ( "border-right", "10px solid transparent" )
            , ( "border-top", "20px solid " ++ color)
            , ("margin", "5px 15px 5px 0")
            ]
        ]
        []

viewInputJson : Model -> Html.Html Msg
viewInputJson model =
    Html.div
        []
        [ Html.textarea
            [ Html.Attributes.style [ ( "width", "100%" ), ( "height", "500px" ), ("font-size", "22px") ]
            , Html.Events.onInput ChangeJson
            , Html.Attributes.value model.tempJson
            ]
            []
        , Html.div [] [ formButton SaveChange "Test" ]
        ]

formButton : msg -> String -> Html.Html msg
formButton action text =
    Html.button
        [ Html.Events.onClick action
        , Html.Attributes.style
            [ ("font-size", "24px")
            , ( "width", "100%")
            , ("border-style", "none")
            , ("border-radius", "4px")
            , ("background-color", "#07c")
            , ("color", "white")
            , ("margin", "5px")
            ]
        ]
        [ Html.text text ]

view : Model -> Html.Html Msg
view model =
    let
        decoderResults =
            Dict.toList model.knownDecoders
                |> List.map (\( name, decoder ) -> (name, runDecoder decoder model.json))

        sortedBySuccess =
            decoderResults
                |> List.sortBy (\(name, result) ->
                    case result of
                        Err e ->
                            1000
                        Ok _ ->
                            0
                    )

        isOk res =
            case res of
                Ok _ -> True
                _ -> False

        viewResults =
            List.map (\(name, result) -> viewSimpleResult (model.visibleResult == Just name) name result) sortedBySuccess

        successfulRuns =
            List.filter (\(_, result) -> isOk result) decoderResults
                |> List.length

        columnStyle =
            Html.Attributes.style [("width", "410px"), ("padding", "0 20px") ]
    in
        Html.div
            [ Html.Attributes.style [( "display", "flex"), ("flex-direction", "column"), ( "align-items", "center")]]
            [ Html.h1 [] [ Html.text "elm-debug-decoders" ]
            , Html.div
                [ Html.Attributes.style [ ("display", "flex"), ("flex-direction", "row"), ("width", "900px")]]
                [ Html.div [ columnStyle ]
                    [viewInputJson model]
                , Html.div [ columnStyle ]
                    [ viewHowManyRan model successfulRuns
                    , Html.ul [ Html.Attributes.style [ ("list-style", "none"), ("padding-left", "0") ]]
                        (viewResults)
                    ]
                ]
            ]


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson }, Cmd.none )

        SetCurrentResult result ->
            ( { model | visibleResult = result }, Cmd.none )


main = Html.program
    { init = ({ json = "", tempJson = "", knownDecoders = decodersByName, visibleResult = Nothing }, Cmd.none)
    , update=  update
    , view = view
    , subscriptions = (\_ -> Sub.none)
    }
