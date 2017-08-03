

module DebugDecoders exposing (main)

import Html
import Html.Attributes
import Html.Events
import Dict
import Json.Decode

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
    | SetCurrentResult String


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
        Json_Decode_DecoderMain_UserConstructor model -> Html.text <| toString model


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
    "I ran "
        ++ (toString <| Dict.size model.knownDecoders)
        ++ " decoders!"
        ++ (toString amount) ++ " passed successfully."
        |> Html.text


runDecoder : Json.Decode.Decoder KnownDecoders -> String -> Result String KnownDecoders 
runDecoder = 
    Json.Decode.decodeString

viewSimpleResult : String -> Result String KnownDecoders -> Html.Html Msg
viewSimpleResult decoderName result =
    let
        color =
            case result of
                Err _ ->
                    "red"

                Ok _ ->
                    "green"
    in
        Html.div
            [ Html.Events.onClick (SetCurrentResult decoderName) ]
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


viewSuccessfulThing : Model -> Html.Html msg 
viewSuccessfulThing model = 
    case model.visibleResult of 
        Nothing -> Html.text ""

        Just result ->
            case Dict.get result model.knownDecoders of 
                Just foundDecoder ->
                    let    
                        runResult = runDecoder foundDecoder model.json
                    in 
                        Html.div 
                            []
                            [ Html.span [ ] [ Html.text <| "The decoder known as " ++ result ++ " produced the following value: " ]
                            , Html.p [ ] [ 
                                case runResult of 
                                    Ok v -> Html.div [] [ Html.text (resultToEnglish v) ]
                                    Err e -> Html.text e
                                ]
                            , Html.span [] [ Html.text <| "And I found this view: " ]
                            , Html.div [] [
                                case runResult of
                                    Ok v -> viewAResult v 
                                    Err _ -> Html.text ""
                                ]

                            ] 

                Nothing ->
                    Html.text ""
            


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
            List.map (\(name, result) -> viewSimpleResult name result) sortedBySuccess

        successfulRuns = 
            List.filter (\(_, result) -> isOk result) decoderResults
                |> List.length

    in
        Html.div
            []
            [ Html.div [] (viewInputJson model :: viewHowManyRan model successfulRuns :: viewSuccessfulThing model :: [] ) 
            , Html.div [] (viewResults)
            ]


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson, visibleResult = Nothing }, Cmd.none )

        SetCurrentResult result ->
            ( { model | visibleResult = Just result }, Cmd.none )


main = Html.program 
    { init = ({ json = "", tempJson = "", knownDecoders = decodersByName, visibleResult = Nothing }, Cmd.none)
    , update=  update
    , view = view 
    , subscriptions = (\_ -> Sub.none)
    }
